const express = require('express');
const { Role } = require('@prisma/client');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { validateOrderInput, parsePositiveInt, parseBoolean, validateComplaintType } = require('../utils/validators');
const {
  CATEGORY_RATES,
  ORDER_STATUS,
  WORKER_STATUS,
  WORKER_APPROVAL_STATUS,
  CUSTOMER_PAYMENT_STATUS,
  ATTENDANCE_REQUEST_STATUS,
  PAYMENT_STATUS,
  COMPLAINT_TYPE,
} = require('../utils/constants');
const { getPagination } = require('../utils/pagination');
const { toDateOnly, addUtcDays, getDateRange, toIsoDateString } = require('../utils/date');
const { hasRazorpayConfig, createRazorpayOrder, verifyRazorpaySignature } = require('../services/razorpay');
const prisma = require('../lib/prisma');
const {
  createWithNumericId,
  createManyWithNumericIds,
  upsertWithNumericId,
} = require('../lib/numericIds');
const router = express.Router();

function normalizeCategory(rawCategory) {
  return String(rawCategory || '').trim().toLowerCase();
}

function normalizeServiceAddress(rawAddress) {
  return String(rawAddress || '').trim();
}

function getOrderEndDate(order) {
  const startDate = toDateOnly(order.startDate);
  if (!startDate) return null;
  return addUtcDays(startDate, order.durationDays - 1);
}

function normalizeComplaintType(type) {
  if (!type) return COMPLAINT_TYPE.POOR_QUALITY;
  if (type === 'quality') return COMPLAINT_TYPE.POOR_QUALITY;
  return type;
}

async function getCustomerForUser(userId) {
  return prisma.customer.findUnique({
    where: { userId },
    select: {
      id: true,
      state: true,
      district: true,
      block: true,
      stateId: true,
      districtId: true,
      blockId: true,
    },
  });
}

async function getOrderById(orderId) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customerId: true,
      category: true,
      workersCount: true,
      startDate: true,
      durationDays: true,
      rate: true,
      total: true,
      status: true,
      customerPaymentStatus: true,
      customerPaymentOrderId: true,
      customerPaymentId: true,
      customerPaymentSignature: true,
      customerPaidAt: true,
      state: true,
      district: true,
      block: true,
      serviceAddress: true,
      stateId: true,
      districtId: true,
      blockId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function ensureOrderAccess(order, user) {
  if (!order) {
    return { ok: false, status: 404, error: 'Order not found' };
  }

  if ((user.role === Role.BLOCK_ADMIN || user.role === Role.CSC_AGENT) && order.blockId !== user.blockId) {
    return { ok: false, status: 403, error: 'Cannot access order outside your block' };
  }

  if (user.role === Role.CUSTOMER) {
    const customer = await prisma.customer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!customer || customer.id !== order.customerId) {
      return { ok: false, status: 403, error: 'Cannot access another customer order' };
    }
  }

  return { ok: true };
}

function parseRangeWithinOrder(order, fromDateInput, toDateInput) {
  const orderStart = toDateOnly(order.startDate);
  const orderEnd = getOrderEndDate(order);
  const fromDate = toDateOnly(fromDateInput || orderStart);
  const toDate = toDateOnly(toDateInput || orderEnd);

  if (!orderStart || !orderEnd || !fromDate || !toDate) {
    return { error: 'Invalid date range' };
  }
  if (fromDate > toDate) {
    return { error: 'fromDate must be <= toDate' };
  }
  if (fromDate < orderStart || toDate > orderEnd) {
    return { error: 'Selected date range must be inside order schedule' };
  }

  const dates = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    dates.push(cursor);
    cursor = addUtcDays(cursor, 1);
  }

  return { fromDate, toDate, dates };
}

async function recomputeWorkerOperationalState(db, workerId) {
  const worker = await db.worker.findUnique({
    where: { id: workerId },
    select: { id: true, status: true, approvalStatus: true },
  });
  if (!worker) return;

  const today = toDateOnly(new Date());
  const activeOrders = await db.orderWorkerDay.findMany({
    where: {
      workerId,
      isActive: true,
      workDate: { gte: today },
      order: {
        status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED, ORDER_STATUS.ONGOING] },
        customerPaymentStatus: CUSTOMER_PAYMENT_STATUS.PAID,
      },
    },
    select: { orderId: true },
    distinct: ['orderId'],
  });

  const activeJobs = activeOrders.length;
  const approved = worker.approvalStatus === WORKER_APPROVAL_STATUS.APPROVED;
  const suspended = worker.status === WORKER_STATUS.SUSPENDED;

  const updateData = { activeJobs };
  if (!approved || suspended) {
    updateData.isAvailable = false;
  } else {
    updateData.status = activeJobs > 0 ? WORKER_STATUS.BUSY : WORKER_STATUS.ACTIVE;
    updateData.isAvailable = activeJobs === 0;
  }

  await db.worker.update({ where: { id: workerId }, data: updateData });
}

async function recomputeOrderAssignmentProgress(tx, orderId) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      workersCount: true,
      durationDays: true,
      status: true,
      customerPaymentStatus: true,
    },
  });
  if (!order) return null;

  const assignedSlots = await tx.orderWorkerDay.count({
    where: { orderId, isActive: true },
  });
  const requiredSlots = order.workersCount * order.durationDays;

  let nextStatus = order.status;
  if (![ORDER_STATUS.ONGOING, ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED].includes(order.status)) {
    if (order.customerPaymentStatus !== CUSTOMER_PAYMENT_STATUS.PAID) {
      nextStatus = ORDER_STATUS.PENDING;
    } else if (assignedSlots >= requiredSlots) {
      nextStatus = ORDER_STATUS.ASSIGNED;
    } else {
      nextStatus = ORDER_STATUS.PENDING;
    }
  }

  if (nextStatus !== order.status) {
    await tx.order.update({ where: { id: orderId }, data: { status: nextStatus } });
  }

  return {
    assignedSlots,
    requiredSlots,
    isFullyAssigned: assignedSlots >= requiredSlots,
    status: nextStatus,
  };
}

router.post('/', authenticate, authorizeRoles(Role.CUSTOMER), async (req, res) => {
  const category = normalizeCategory(req.body.category);
  const serviceAddress = normalizeServiceAddress(
    req.body.serviceAddress ?? req.body.service_address ?? req.body.address,
  );
  const workersCount = Number(req.body.workers_count ?? req.body.workersCount);
  const durationDays = Number(req.body.duration_days ?? req.body.durationDays);
  const startDateInput = req.body.start_date ?? req.body.startDate;

  const validationErrors = validateOrderInput({
    category,
    serviceAddress,
    workersCount,
    durationDays,
    startDate: startDateInput,
  });
  if (validationErrors.length) {
    return res.status(400).json({ errors: validationErrors });
  }

  const customer = await getCustomerForUser(req.user.id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer profile not found' });
  }

  const startDate = toDateOnly(startDateInput);
  const rate = CATEGORY_RATES[category] || 1000;
  const total = rate * workersCount * durationDays;

  const order = await createWithNumericId(prisma, 'order', {
    data: {
      customerId: customer.id,
      category,
      workersCount,
      startDate,
      durationDays,
      rate,
      total,
      status: ORDER_STATUS.PENDING,
      customerPaymentStatus: CUSTOMER_PAYMENT_STATUS.UNPAID,
      state: customer.state,
      district: customer.district,
      block: customer.block,
      serviceAddress,
      stateId: customer.stateId,
      districtId: customer.districtId,
      blockId: customer.blockId,
    },
    select: {
      id: true,
      category: true,
      workersCount: true,
      startDate: true,
      durationDays: true,
      total: true,
      rate: true,
      status: true,
      customerPaymentStatus: true,
      block: true,
      serviceAddress: true,
      createdAt: true,
    },
  });

  return res.status(201).json({
    order,
    message: 'Order created. Complete payment to activate assignment workflow.',
  });
});

router.post('/:id/payment-intent', authenticate, authorizeRoles(Role.CUSTOMER), async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  if (!orderId) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  if (!hasRazorpayConfig()) {
    return res.status(500).json({
      error: 'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend .env',
    });
  }

  const order = await getOrderById(orderId);
  const access = await ensureOrderAccess(order, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  if (order.status === ORDER_STATUS.CANCELLED) {
    return res.status(400).json({ error: 'Cannot pay for cancelled order' });
  }

  if (order.customerPaymentStatus === CUSTOMER_PAYMENT_STATUS.PAID) {
    return res.json({
      message: 'Order already paid',
      orderId: order.id,
      customerPaymentStatus: order.customerPaymentStatus,
      razorpayOrderId: order.customerPaymentOrderId,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount: Math.round(order.total * 100),
      currency: 'INR',
    });
  }

  const razorpayOrder = await createRazorpayOrder({
    amountInPaise: Math.round(order.total * 100),
    receipt: `order_${order.id}_${Date.now()}`,
    notes: {
      appOrderId: String(order.id),
      customerId: String(order.customerId),
      blockId: String(order.blockId),
    },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: {
      customerPaymentStatus: CUSTOMER_PAYMENT_STATUS.INITIATED,
      customerPaymentOrderId: razorpayOrder.id,
    },
  });

  return res.json({
    keyId: process.env.RAZORPAY_KEY_ID,
    orderId: order.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    razorpayOrderId: razorpayOrder.id,
    customerPaymentStatus: CUSTOMER_PAYMENT_STATUS.INITIATED,
  });
});

router.post('/:id/payment-verify', authenticate, authorizeRoles(Role.CUSTOMER), async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  if (!orderId) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  const razorpayOrderId = String(req.body.razorpay_order_id || req.body.razorpayOrderId || '').trim();
  const razorpayPaymentId = String(req.body.razorpay_payment_id || req.body.razorpayPaymentId || '').trim();
  const razorpaySignature = String(req.body.razorpay_signature || req.body.razorpaySignature || '').trim();

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return res.status(400).json({ error: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required' });
  }

  const order = await getOrderById(orderId);
  const access = await ensureOrderAccess(order, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  if (order.customerPaymentOrderId && order.customerPaymentOrderId !== razorpayOrderId) {
    return res.status(400).json({ error: 'Razorpay order id mismatch' });
  }

  const validSignature = verifyRazorpaySignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });
  if (!validSignature) {
    await prisma.order.update({
      where: { id: order.id },
      data: { customerPaymentStatus: CUSTOMER_PAYMENT_STATUS.FAILED },
    });
    return res.status(400).json({ error: 'Invalid Razorpay signature. Payment verification failed.' });
  }

  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      customerPaymentStatus: CUSTOMER_PAYMENT_STATUS.PAID,
      customerPaymentOrderId: razorpayOrderId,
      customerPaymentId: razorpayPaymentId,
      customerPaymentSignature: razorpaySignature,
      customerPaidAt: new Date(),
      status: ORDER_STATUS.PENDING,
    },
    select: {
      id: true,
      status: true,
      customerPaymentStatus: true,
      customerPaidAt: true,
      customerPaymentOrderId: true,
      customerPaymentId: true,
    },
  });

  return res.json({
    message: 'Payment verified. Order is now visible for block admin assignment.',
    order: updatedOrder,
  });
});

router.get('/:id/assignment-availability', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  if (!orderId) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  const order = await getOrderById(orderId);
  const access = await ensureOrderAccess(order, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const { page, limit, skip } = getPagination(req.query);
  const range = parseRangeWithinOrder(order, req.query.fromDate, req.query.toDate);
  if (range.error) {
    return res.status(400).json({ error: range.error });
  }

  const workerWhere = {
    blockId: order.blockId,
    category: order.category,
    approvalStatus: WORKER_APPROVAL_STATUS.APPROVED,
    status: { in: [WORKER_STATUS.ACTIVE, WORKER_STATUS.BUSY] },
  };
  const workerIdFilter = parsePositiveInt(req.query.workerId);
  if (workerIdFilter) {
    workerWhere.id = workerIdFilter;
  }

  const [total, workers] = await prisma.$transaction([
    prisma.worker.count({ where: workerWhere }),
    prisma.worker.findMany({
      where: workerWhere,
      take: limit,
      skip,
      orderBy: [{ rating: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        phone: true,
        rating: true,
        status: true,
        isAvailable: true,
        activeJobs: true,
        totalJobs: true,
      },
    }),
  ]);

  const workerIds = workers.map((worker) => worker.id);
  let conflictRows = [];
  let existingRows = [];
  if (workerIds.length) {
    conflictRows = await prisma.orderWorkerDay.findMany({
      where: {
        workerId: { in: workerIds },
        workDate: { in: range.dates },
        isActive: true,
        NOT: { orderId },
        order: {
          status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED, ORDER_STATUS.ONGOING] },
        },
      },
      select: { workerId: true, workDate: true },
    });

    existingRows = await prisma.orderWorkerDay.findMany({
      where: {
        workerId: { in: workerIds },
        orderId,
        workDate: { in: range.dates },
        isActive: true,
      },
      select: { workerId: true, workDate: true },
    });
  }

  const conflictByWorker = new Map();
  for (const row of conflictRows) {
    const current = conflictByWorker.get(row.workerId) || new Set();
    current.add(toIsoDateString(row.workDate));
    conflictByWorker.set(row.workerId, current);
  }

  const assignedByWorker = new Map();
  for (const row of existingRows) {
    const current = assignedByWorker.get(row.workerId) || new Set();
    current.add(toIsoDateString(row.workDate));
    assignedByWorker.set(row.workerId, current);
  }

  const targetIsoDates = range.dates.map((date) => toIsoDateString(date));
  const rows = workers.map((worker) => {
    const conflicts = conflictByWorker.get(worker.id) || new Set();
    const alreadyAssigned = assignedByWorker.get(worker.id) || new Set();
    const availableDates = targetIsoDates.filter((date) => !conflicts.has(date));

    return {
      ...worker,
      requestedDateCount: targetIsoDates.length,
      availableDateCount: availableDates.length,
      fullyAvailable: availableDates.length === targetIsoDates.length,
      availableDates,
      unavailableDates: Array.from(conflicts).sort(),
      alreadyAssignedDates: Array.from(alreadyAssigned).sort(),
    };
  });

  return res.json({
    orderId,
    fromDate: toIsoDateString(range.fromDate),
    toDate: toIsoDateString(range.toDate),
    workers: rows,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

router.post('/:id/assignments', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  const workerId = parsePositiveInt(req.body.workerId ?? req.body.worker_id);
  if (!orderId || !workerId) {
    return res.status(400).json({ error: 'Valid order id and workerId are required' });
  }

  const order = await getOrderById(orderId);
  const access = await ensureOrderAccess(order, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  if (order.customerPaymentStatus !== CUSTOMER_PAYMENT_STATUS.PAID) {
    return res.status(400).json({ error: 'Order must be customer-paid before assignment' });
  }

  const range = parseRangeWithinOrder(order, req.body.fromDate, req.body.toDate);
  if (range.error) {
    return res.status(400).json({ error: range.error });
  }

  const note = String(req.body.note || '').trim() || null;
  const worker = await prisma.worker.findUnique({
    where: { id: workerId },
    select: { id: true, blockId: true, category: true, status: true, approvalStatus: true },
  });

  if (!worker) {
    return res.status(404).json({ error: 'Worker not found' });
  }
  if (worker.blockId !== order.blockId) {
    return res.status(400).json({ error: 'Worker does not belong to order block' });
  }
  if (worker.category !== order.category) {
    return res.status(400).json({ error: 'Worker category does not match order category' });
  }
  if (worker.approvalStatus !== WORKER_APPROVAL_STATUS.APPROVED) {
    return res.status(400).json({ error: 'Worker must be approved before assignment' });
  }

  const conflictRows = await prisma.orderWorkerDay.findMany({
    where: {
      workerId,
      isActive: true,
      workDate: { in: range.dates },
      NOT: { orderId },
      order: {
        status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED, ORDER_STATUS.ONGOING] },
      },
    },
    select: { workDate: true },
  });

  const conflictSet = new Set(conflictRows.map((row) => toIsoDateString(row.workDate)));
  const assignableDates = range.dates.filter((date) => !conflictSet.has(toIsoDateString(date)));
  const skippedDates = range.dates.filter((date) => conflictSet.has(toIsoDateString(date))).map((date) => toIsoDateString(date));

  if (!assignableDates.length) {
    return res.status(400).json({ error: 'Worker is unavailable for all selected dates', skippedDates });
  }

  const progress = await prisma.$transaction(async (tx) => {
    const assignableIsoDates = assignableDates.map((date) => toIsoDateString(date));

    await upsertWithNumericId(tx, 'orderWorker', {
      where: { orderId_workerId: { orderId, workerId } },
      create: { orderId, workerId, completed: false },
      update: { completed: false },
    });

    const existingRows = await tx.orderWorkerDay.findMany({
      where: {
        orderId,
        workerId,
        workDate: { in: assignableDates },
      },
      select: { workDate: true },
    });

    const existingIsoSet = new Set(existingRows.map((row) => toIsoDateString(row.workDate)));
    const createDates = assignableDates.filter((date) => !existingIsoSet.has(toIsoDateString(date)));
    const updateIsoDates = assignableIsoDates.filter((isoDate) => existingIsoSet.has(isoDate));

    if (createDates.length) {
      await createManyWithNumericIds(tx, 'orderWorkerDay', {
        data: createDates.map((workDate) => ({
          orderId,
          workerId,
          workDate,
          isActive: true,
          note,
          assignedById: req.user.id,
        })),
      });
    }

    if (updateIsoDates.length) {
      await tx.orderWorkerDay.updateMany({
        where: {
          orderId,
          workerId,
          workDate: { in: updateIsoDates.map((isoDate) => toDateOnly(isoDate)) },
        },
        data: {
          isActive: true,
          removedReason: null,
          note,
          assignedById: req.user.id,
        },
      });
    }

    const nextProgress = await recomputeOrderAssignmentProgress(tx, orderId);
    return nextProgress;
  }, {
    timeout: 60000,
    maxWait: 10000,
  });

  await recomputeWorkerOperationalState(prisma, workerId);

  return res.status(201).json({
    message: 'Worker assigned for available dates',
    workerId,
    assignedDates: assignableDates.map((date) => toIsoDateString(date)),
    skippedDates,
    progress,
  });
});

router.delete('/:id/assignments', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  const workerId = parsePositiveInt(req.body.workerId ?? req.body.worker_id);
  const reason = String(req.body.reason || '').trim();
  if (!orderId || !workerId) {
    return res.status(400).json({ error: 'Valid order id and workerId are required' });
  }
  if (!reason) {
    return res.status(400).json({ error: 'reason is required to remove assignments' });
  }

  const order = await getOrderById(orderId);
  const access = await ensureOrderAccess(order, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const range = parseRangeWithinOrder(order, req.body.fromDate, req.body.toDate);
  if (range.error) {
    return res.status(400).json({ error: range.error });
  }

  const response = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.orderWorkerDay.updateMany({
      where: {
        orderId,
        workerId,
        workDate: { in: range.dates },
        isActive: true,
      },
      data: {
        isActive: false,
        removedReason: reason,
      },
    });

    const remaining = await tx.orderWorkerDay.count({
      where: {
        orderId,
        workerId,
        isActive: true,
      },
    });

    await tx.orderWorker.updateMany({
      where: { orderId, workerId },
      data: { completed: remaining === 0 },
    });

    const progress = await recomputeOrderAssignmentProgress(tx, orderId);

    return { updatedCount: updateResult.count, progress };
  }, {
    timeout: 20000,
    maxWait: 10000,
  });

  await recomputeWorkerOperationalState(prisma, workerId);

  return res.json({
    message: 'Assignments updated',
    workerId,
    fromDate: toIsoDateString(range.fromDate),
    toDate: toIsoDateString(range.toDate),
    ...response,
  });
});

router.post('/:id/attendance-request', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  const requestDate = toDateOnly(req.body.date);
  if (!orderId || !requestDate) {
    return res.status(400).json({ error: 'Valid order id and date are required' });
  }

  const order = await getOrderById(orderId);
  const access = await ensureOrderAccess(order, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const dateRange = getDateRange(order.startDate, order.durationDays).map((date) => toIsoDateString(date));
  if (!dateRange.includes(toIsoDateString(requestDate))) {
    return res.status(400).json({ error: 'date must be within order schedule' });
  }

  const activeAssignments = await prisma.orderWorkerDay.findMany({
    where: { orderId, workDate: requestDate, isActive: true },
    select: {
      workerId: true,
      worker: {
        select: { id: true, name: true, phone: true, category: true },
      },
    },
  });

  if (!activeAssignments.length) {
    return res.status(400).json({ error: 'No workers assigned for selected date' });
  }

  const createdRequest = await prisma.$transaction(async (tx) => {
    const attendanceRequest = await upsertWithNumericId(tx, 'attendanceRequest', {
      where: { orderId_date: { orderId, date: requestDate } },
      create: {
        orderId,
        date: requestDate,
        requestedById: req.user.id,
        status: ATTENDANCE_REQUEST_STATUS.REQUESTED,
      },
      update: {
        requestedById: req.user.id,
        status: ATTENDANCE_REQUEST_STATUS.REQUESTED,
        customerConfirmed: null,
        customerFeedback: null,
        respondedAt: null,
      },
      select: { id: true, date: true, status: true, orderId: true },
    });

    for (const assignment of activeAssignments) {
      await upsertWithNumericId(tx, 'attendance', {
        where: {
          workerId_orderId_date: {
            workerId: assignment.workerId,
            orderId,
            date: requestDate,
          },
        },
        create: {
          workerId: assignment.workerId,
          orderId,
          requestId: attendanceRequest.id,
          date: requestDate,
          status: 'present',
          confirmed: false,
          customerConfirmed: null,
        },
        update: {
          requestId: attendanceRequest.id,
          status: 'present',
          confirmed: false,
          customerConfirmed: null,
        },
      });
    }

    return attendanceRequest;
  });

  return res.status(201).json({
    message: 'Daily attendance request created',
    attendanceRequest: createdRequest,
    workers: activeAssignments.map((row) => row.worker),
  });
});

router.post('/:id/customer-attendance-response', authenticate, authorizeRoles(Role.CUSTOMER), async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  const requestDate = toDateOnly(req.body.date);
  const confirmed = parseBoolean(req.body.confirmed);
  const feedback = String(req.body.feedback || '').trim() || null;
  const complaintType = normalizeComplaintType(req.body.complaintType || req.body.complaint_type);
  const complaintDetails = String(req.body.complaintDetails || req.body.complaint_details || '').trim();

  if (!orderId || !requestDate || confirmed === null) {
    return res.status(400).json({ error: 'Valid order id, date and confirmed(boolean) are required' });
  }
  if (!validateComplaintType(complaintType)) {
    return res.status(400).json({ error: 'Invalid complaint type' });
  }

  const order = await getOrderById(orderId);
  const access = await ensureOrderAccess(order, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const customer = await prisma.customer.findUnique({
    where: { userId: req.user.id },
    select: { id: true },
  });
  if (!customer || customer.id !== order.customerId) {
    return res.status(403).json({ error: 'Cannot confirm attendance for another customer order' });
  }

  const requestRecord = await prisma.attendanceRequest.findUnique({
    where: { orderId_date: { orderId, date: requestDate } },
    select: {
      id: true,
      attendances: {
        select: {
          id: true,
          workerId: true,
          orderId: true,
          date: true,
          status: true,
        },
      },
    },
  });

  if (!requestRecord) {
    return res.status(404).json({ error: 'Attendance request not found for selected date' });
  }
  if (!requestRecord.attendances.length) {
    return res.status(400).json({ error: 'No attendance records found for this request' });
  }

  let complaint = null;
  await prisma.$transaction(async (tx) => {
    await tx.attendanceRequest.update({
      where: { id: requestRecord.id },
      data: {
        status: confirmed ? ATTENDANCE_REQUEST_STATUS.CONFIRMED : ATTENDANCE_REQUEST_STATUS.DISPUTED,
        customerConfirmed: confirmed,
        customerFeedback: feedback,
        respondedAt: new Date(),
      },
    });

    await tx.attendance.updateMany({
      where: { requestId: requestRecord.id },
      data: {
        confirmed,
        customerConfirmed: confirmed,
      },
    });

    if (confirmed) {
      for (const attendance of requestRecord.attendances) {
        if (attendance.status !== 'present') continue;

        const existingPayment = await tx.payment.findUnique({
          where: {
            workerId_date: {
              workerId: attendance.workerId,
              date: attendance.date,
            },
          },
          select: { id: true },
        });

        if (!existingPayment) {
          await createWithNumericId(tx, 'payment', {
            data: {
              workerId: attendance.workerId,
              orderId: attendance.orderId,
              attendanceId: attendance.id,
              date: attendance.date,
              amount: order.rate,
              status: PAYMENT_STATUS.PENDING,
              verified: true,
            },
          });
        }
      }

      if ([ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED].includes(order.status)) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: ORDER_STATUS.ONGOING },
        });
      }
    } else {
      complaint = await createWithNumericId(tx, 'complaint', {
        data: {
          customerId: customer.id,
          orderId,
          type: complaintType,
          details: complaintDetails || 'Customer rejected daily attendance request.',
        },
        select: {
          id: true,
          type: true,
          details: true,
          status: true,
          createdAt: true,
        },
      });
    }
  });

  return res.json({
    message: confirmed
      ? 'Attendance confirmed and worker payments generated as pending.'
      : 'Attendance disputed and complaint created for admin review.',
    orderId,
    date: requestDate,
    confirmed,
    complaint,
  });
});

router.get('/', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN, Role.CUSTOMER, Role.CSC_AGENT), async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const where = {};

  if (req.user.role === Role.BLOCK_ADMIN || req.user.role === Role.CSC_AGENT) {
    where.blockId = req.user.blockId;
    where.customerPaymentStatus = CUSTOMER_PAYMENT_STATUS.PAID;
  }

  if (req.user.role === Role.CUSTOMER) {
    const customer = await prisma.customer.findUnique({ where: { userId: req.user.id }, select: { id: true } });
    if (!customer) {
      return res.status(404).json({ error: 'Customer profile not found' });
    }
    where.customerId = customer.id;
  }

  if (req.query.status && Object.values(ORDER_STATUS).includes(req.query.status)) {
    where.status = req.query.status;
  }
  if (req.query.customerPaymentStatus && Object.values(CUSTOMER_PAYMENT_STATUS).includes(req.query.customerPaymentStatus)) {
    where.customerPaymentStatus = req.query.customerPaymentStatus;
  }
  if (req.query.category) {
    where.category = normalizeCategory(req.query.category);
  }

  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      take: limit,
      skip,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        customerId: true,
        category: true,
        workersCount: true,
        startDate: true,
        durationDays: true,
        rate: true,
        total: true,
        status: true,
        customerPaymentStatus: true,
        customerPaidAt: true,
        state: true,
        district: true,
        block: true,
        serviceAddress: true,
        createdAt: true,
        updatedAt: true,
        customer: {
          select: {
            id: true,
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
      },
    }),
  ]);

  const orderIds = orders.map((order) => order.id);
  let slotCounts = [];
  let pendingAttendance = [];
  if (orderIds.length) {
    slotCounts = await prisma.orderWorkerDay.groupBy({
      by: ['orderId'],
      where: { orderId: { in: orderIds }, isActive: true },
      _count: { _all: true },
    });

    pendingAttendance = await prisma.attendanceRequest.groupBy({
      by: ['orderId'],
      where: { orderId: { in: orderIds }, status: ATTENDANCE_REQUEST_STATUS.REQUESTED },
      _count: { _all: true },
    });
  }

  const slotMap = new Map(slotCounts.map((row) => [row.orderId, row._count._all]));
  const pendingMap = new Map(pendingAttendance.map((row) => [row.orderId, row._count._all]));

  const rows = orders.map((order) => {
    const requiredSlots = order.workersCount * order.durationDays;
    const assignedSlots = slotMap.get(order.id) || 0;
    return {
      ...order,
      requiredSlots,
      assignedSlots,
      assignmentCoverage: requiredSlots ? Number(((assignedSlots / requiredSlots) * 100).toFixed(2)) : 0,
      pendingAttendanceRequests: pendingMap.get(order.id) || 0,
      endDate: getOrderEndDate(order),
    };
  });

  return res.json({
    orders: rows,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

router.get('/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN, Role.CUSTOMER, Role.CSC_AGENT), async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  if (!orderId) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customerId: true,
      category: true,
      workersCount: true,
      startDate: true,
      durationDays: true,
      rate: true,
      total: true,
      status: true,
      customerPaymentStatus: true,
      customerPaymentOrderId: true,
      customerPaymentId: true,
      customerPaidAt: true,
      state: true,
      district: true,
      block: true,
      serviceAddress: true,
      blockId: true,
      createdAt: true,
      updatedAt: true,
      customer: {
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
      },
      orderWorkers: {
        select: {
          workerId: true,
          completed: true,
          worker: {
            select: {
              id: true,
              name: true,
              phone: true,
              category: true,
              status: true,
              approvalStatus: true,
              rating: true,
            },
          },
        },
      },
      orderWorkerDays: {
        where: { isActive: true },
        orderBy: [{ workDate: 'asc' }, { workerId: 'asc' }],
        select: {
          id: true,
          workDate: true,
          workerId: true,
          note: true,
          worker: {
            select: { id: true, name: true, phone: true, status: true, rating: true },
          },
        },
      },
      attendanceRequests: {
        orderBy: { date: 'desc' },
        select: {
          id: true,
          date: true,
          status: true,
          customerConfirmed: true,
          customerFeedback: true,
          createdAt: true,
          respondedAt: true,
          attendances: {
            select: {
              id: true,
              status: true,
              confirmed: true,
              customerConfirmed: true,
              worker: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      },
      payments: {
        select: {
          id: true,
          workerId: true,
          date: true,
          amount: true,
          status: true,
          transactionRef: true,
          transactionDate: true,
          paidAt: true,
        },
      },
    },
  });

  const access = await ensureOrderAccess(order, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const requiredSlots = order.workersCount * order.durationDays;
  const assignedSlots = order.orderWorkerDays.length;

  return res.json({
    order: {
      ...order,
      requiredSlots,
      assignedSlots,
      assignmentCoverage: requiredSlots ? Number(((assignedSlots / requiredSlots) * 100).toFixed(2)) : 0,
      endDate: getOrderEndDate(order),
    },
  });
});

router.patch('/:id/status', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const orderId = parsePositiveInt(req.params.id);
  const status = String(req.body.status || '').trim();
  const reason = String(req.body.reason || '').trim();

  if (!orderId) return res.status(400).json({ error: 'Invalid order id' });
  if (!Object.values(ORDER_STATUS).includes(status)) {
    return res.status(400).json({ error: 'Invalid order status' });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      blockId: true,
      status: true,
      workersCount: true,
      durationDays: true,
      customerPaymentStatus: true,
    },
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (req.user.role === Role.BLOCK_ADMIN && order.blockId !== req.user.blockId) {
    return res.status(403).json({ error: 'Cannot update order outside your block' });
  }

  if ([ORDER_STATUS.CANCELLED, ORDER_STATUS.COMPLETED].includes(status) && !reason) {
    return res.status(400).json({ error: 'reason is required for completed/cancelled transitions' });
  }

  if (status === ORDER_STATUS.ASSIGNED) {
    const assignedSlots = await prisma.orderWorkerDay.count({ where: { orderId, isActive: true } });
    const requiredSlots = order.workersCount * order.durationDays;
    if (order.customerPaymentStatus !== CUSTOMER_PAYMENT_STATUS.PAID || assignedSlots < requiredSlots) {
      return res.status(400).json({ error: 'Order cannot move to assigned until paid and fully assigned' });
    }
  }

  if (status === ORDER_STATUS.ONGOING) {
    const confirmedDays = await prisma.attendanceRequest.count({
      where: { orderId, status: ATTENDANCE_REQUEST_STATUS.CONFIRMED },
    });
    if (confirmedDays === 0) {
      return res.status(400).json({ error: 'At least one confirmed attendance day is required for ongoing status' });
    }
  }

  const { order: updatedOrder, workerIdsToRecompute } = await prisma.$transaction(async (tx) => {
    let workerIdsToRecompute = [];

    if (status === ORDER_STATUS.CANCELLED) {
      await tx.orderWorkerDay.updateMany({
        where: { orderId, isActive: true },
        data: { isActive: false, removedReason: reason },
      });
    }

    const nextOrder = await tx.order.update({
      where: { id: orderId },
      data: { status },
      select: { id: true, status: true, updatedAt: true },
    });

    if ([ORDER_STATUS.CANCELLED, ORDER_STATUS.COMPLETED].includes(status)) {
      const workers = await tx.orderWorker.findMany({
        where: { orderId },
        select: { workerId: true },
      });
      await tx.orderWorker.updateMany({
        where: { orderId },
        data: { completed: true },
      });

      workerIdsToRecompute = Array.from(new Set(workers.map((row) => row.workerId)));
    }

    return {
      order: nextOrder,
      workerIdsToRecompute,
    };
  }, {
    timeout: 20000,
    maxWait: 10000,
  });

  if (workerIdsToRecompute.length) {
    await Promise.all(workerIdsToRecompute.map((workerId) => recomputeWorkerOperationalState(prisma, workerId)));
  }

  return res.json({ order: updatedOrder });
});

module.exports = router;
