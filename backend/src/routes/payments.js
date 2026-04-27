const express = require('express');
const { Role } = require('@prisma/client');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { parsePositiveInt, parseBoolean } = require('../utils/validators');
const {
  PAYMENT_STATUS,
  ATTENDANCE_STATUS,
  PAYMENT_TICKET_STATUS,
} = require('../utils/constants');
const { getPagination } = require('../utils/pagination');
const { toDateOnly } = require('../utils/date');
const prisma = require('../lib/prisma');
const { createWithNumericId } = require('../lib/numericIds');

const router = express.Router();

const paymentListSelect = {
  id: true,
  workerId: true,
  orderId: true,
  attendanceId: true,
  date: true,
  amount: true,
  status: true,
  verified: true,
  adjustedByAdminId: true,
  transactionRef: true,
  transactionDate: true,
  paymentNote: true,
  paidAt: true,
  lockedByAdmin: true,
  lockedAt: true,
  lastEditedByAdminId: true,
  lastEditReason: true,
  worker: {
    select: {
      id: true,
      name: true,
      phone: true,
      category: true,
      state: true,
      district: true,
      block: true,
    },
  },
  order: {
    select: {
      id: true,
      status: true,
      category: true,
      state: true,
      district: true,
      block: true,
      blockId: true,
      customer: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      },
    },
  },
  _count: {
    select: {
      tickets: true,
      auditLogs: true,
    },
  },
  tickets: {
    where: { status: PAYMENT_TICKET_STATUS.OPEN },
    take: 1,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      reason: true,
      status: true,
      createdAt: true,
    },
  },
};

const paymentMutationSelect = {
  id: true,
  workerId: true,
  orderId: true,
  attendanceId: true,
  date: true,
  amount: true,
  status: true,
  verified: true,
  adjustedByAdminId: true,
  transactionRef: true,
  transactionDate: true,
  paymentNote: true,
  paidAt: true,
  lockedByAdmin: true,
  lockedAt: true,
  lastEditedByAdminId: true,
  lastEditReason: true,
  worker: {
    select: {
      id: true,
      name: true,
      phone: true,
      category: true,
      state: true,
      district: true,
      block: true,
    },
  },
  order: {
    select: {
      id: true,
      state: true,
      district: true,
      block: true,
      blockId: true,
    },
  },
};

const paymentAuditSelect = {
  id: true,
  paymentId: true,
  ticketId: true,
  action: true,
  comment: true,
  beforeState: true,
  afterState: true,
  metadata: true,
  createdAt: true,
  actor: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  ticket: {
    select: {
      id: true,
      status: true,
      reason: true,
      adminNote: true,
    },
  },
};

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getTrimmedText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function snapshotPayment(payment) {
  if (!payment) return null;

  return {
    id: payment.id,
    workerId: payment.workerId,
    orderId: payment.orderId,
    attendanceId: payment.attendanceId ?? null,
    date: payment.date,
    amount: payment.amount,
    status: payment.status,
    verified: payment.verified,
    adjustedByAdminId: payment.adjustedByAdminId ?? null,
    transactionRef: payment.transactionRef ?? null,
    transactionDate: payment.transactionDate ?? null,
    paymentNote: payment.paymentNote ?? null,
    paidAt: payment.paidAt ?? null,
    lockedByAdmin: payment.lockedByAdmin,
    lockedAt: payment.lockedAt ?? null,
    lastEditedByAdminId: payment.lastEditedByAdminId ?? null,
    lastEditReason: payment.lastEditReason ?? null,
    worker: payment.worker ? {
      id: payment.worker.id,
      name: payment.worker.name,
      phone: payment.worker.phone,
      category: payment.worker.category,
      state: payment.worker.state,
      district: payment.worker.district,
      block: payment.worker.block,
    } : null,
    order: payment.order ? {
      id: payment.order.id,
      state: payment.order.state,
      district: payment.order.district,
      block: payment.order.block,
      blockId: payment.order.blockId,
    } : null,
  };
}

async function getCustomerScope(userId) {
  const customer = await prisma.customer.findUnique({
    where: { userId },
    select: { id: true },
  });
  return customer?.id || null;
}

async function getWorkerScope(user) {
  if (!user.phone) return null;
  const worker = await prisma.worker.findUnique({
    where: { phone: user.phone },
    select: { id: true },
  });
  return worker?.id || null;
}

async function getPaymentForMutation(paymentId) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    select: paymentMutationSelect,
  });
}

function canAccessPayment(payment, user) {
  if (!payment) return false;
  if (user.role !== Role.BLOCK_ADMIN) return true;
  return payment.order?.blockId === user.blockId;
}

async function createPaymentAuditLog(tx, {
  paymentId = null,
  actorId,
  ticketId = null,
  action,
  comment = null,
  beforeState = null,
  afterState = null,
  metadata = null,
}) {
  return createWithNumericId(tx, 'paymentAuditLog', {
    data: {
      paymentId,
      actorId,
      ticketId,
      action,
      comment,
      beforeState,
      afterState,
      metadata,
    },
    select: paymentAuditSelect,
  });
}

router.post('/create', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const workerId = parsePositiveInt(req.body.workerId ?? req.body.worker_id);
  const orderId = parsePositiveInt(req.body.orderId ?? req.body.order_id);
  const date = toDateOnly(req.body.date);
  const amountInput = req.body.amount;

  if (!workerId || !orderId || !date) {
    return res.status(400).json({ error: 'workerId, orderId and date are required' });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, blockId: true, rate: true },
  });
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (req.user.role === Role.BLOCK_ADMIN && order.blockId !== req.user.blockId) {
    return res.status(403).json({ error: 'Cannot create payment outside your block' });
  }

  const attendance = await prisma.attendance.findUnique({
    where: {
      workerId_orderId_date: {
        workerId,
        orderId,
        date,
      },
    },
    select: {
      id: true,
      status: true,
      confirmed: true,
      customerConfirmed: true,
    },
  });

  if (!attendance) {
    return res.status(400).json({ error: 'Attendance record is required before payment creation' });
  }
  if (attendance.status !== ATTENDANCE_STATUS.PRESENT) {
    return res.status(400).json({ error: 'No payment allowed for absent attendance' });
  }
  if (attendance.confirmed !== true || attendance.customerConfirmed !== true) {
    return res.status(400).json({ error: 'Payment requires verified attendance and customer confirmation' });
  }

  const existing = await prisma.payment.findUnique({
    where: {
      workerId_date: {
        workerId,
        date,
      },
    },
    select: { id: true },
  });
  if (existing) {
    return res.status(409).json({ error: 'Payment already exists for this worker and date' });
  }

  const amount = amountInput != null ? Number(amountInput) : order.rate;
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const payment = await prisma.$transaction(async (tx) => {
    const createdPayment = await createWithNumericId(tx, 'payment', {
      data: {
        workerId,
        orderId,
        attendanceId: attendance.id,
        date,
        amount,
        status: PAYMENT_STATUS.PENDING,
        verified: true,
        adjustedByAdminId: amountInput != null ? req.user.id : null,
      },
      select: paymentMutationSelect,
    });

    await createPaymentAuditLog(tx, {
      paymentId: createdPayment.id,
      actorId: req.user.id,
      action: 'CREATED',
      comment: amountInput != null ? 'Payment created with adjusted amount.' : 'Payment created.',
      beforeState: null,
      afterState: snapshotPayment(createdPayment),
      metadata: {
        createdByRole: req.user.role,
      },
    });

    return createdPayment;
  });

  return res.status(201).json({ payment });
});

router.get('/', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN, Role.CUSTOMER, Role.CSC_AGENT, Role.WORKER), async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const where = {};

  if (req.user.role === Role.BLOCK_ADMIN || req.user.role === Role.CSC_AGENT) {
    where.order = { blockId: req.user.blockId };
  }

  if (req.user.role === Role.CUSTOMER) {
    const customerId = await getCustomerScope(req.user.id);
    if (!customerId) return res.status(404).json({ error: 'Customer profile not found' });
    where.order = { customerId };
  }

  if (req.user.role === Role.WORKER) {
    const workerId = await getWorkerScope(req.user);
    if (!workerId) return res.status(404).json({ error: 'Worker profile not linked with this account' });
    where.workerId = workerId;
  }

  if (req.query.status && Object.values(PAYMENT_STATUS).includes(req.query.status)) {
    where.status = req.query.status;
  }

  if (req.query.workerId) {
    const workerIdFilter = parsePositiveInt(req.query.workerId);
    if (workerIdFilter) where.workerId = workerIdFilter;
  }

  if (req.query.orderId) {
    const orderIdFilter = parsePositiveInt(req.query.orderId);
    if (orderIdFilter) where.orderId = orderIdFilter;
  }

  if (parseBoolean(req.query.locked) === true) {
    where.lockedByAdmin = true;
  } else if (parseBoolean(req.query.locked) === false) {
    where.lockedByAdmin = false;
  }

  const todayPendingOnly = parseBoolean(req.query.todayPendingOnly);
  if (todayPendingOnly === true) {
    where.status = PAYMENT_STATUS.PENDING;
    where.date = toDateOnly(new Date());
  }

  const [total, payments] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      take: limit,
      skip,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      select: paymentListSelect,
    }),
  ]);

  return res.json({
    payments,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

router.get('/:id/history', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const paymentId = parsePositiveInt(req.params.id);
  if (!paymentId) {
    return res.status(400).json({ error: 'Invalid payment id' });
  }

  const payment = await getPaymentForMutation(paymentId);
  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }
  if (!canAccessPayment(payment, req.user)) {
    return res.status(403).json({ error: 'Cannot view history outside your block' });
  }

  const logs = await prisma.paymentAuditLog.findMany({
    where: { paymentId },
    orderBy: { createdAt: 'desc' },
    select: paymentAuditSelect,
  });

  return res.json({ logs });
});

router.patch('/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const paymentId = parsePositiveInt(req.params.id);
  if (!paymentId) {
    return res.status(400).json({ error: 'Invalid payment id' });
  }

  const status = hasOwn(req.body, 'status') ? getTrimmedText(req.body.status)?.toLowerCase() : undefined;
  const hasAmount = hasOwn(req.body, 'amount');
  const amountInput = req.body.amount;
  const hasTransactionRef = hasOwn(req.body, 'transactionRef');
  const transactionRef = hasTransactionRef ? getTrimmedText(req.body.transactionRef) : undefined;
  const hasTransactionDate = hasOwn(req.body, 'transactionDate');
  const transactionDate = hasTransactionDate
    ? (req.body.transactionDate ? toDateOnly(req.body.transactionDate) : null)
    : undefined;
  const hasPaymentNote = hasOwn(req.body, 'paymentNote');
  const paymentNote = hasPaymentNote ? getTrimmedText(req.body.paymentNote) : undefined;
  const editReason = getTrimmedText(req.body.editReason);

  if (!status && !hasAmount && !hasTransactionRef && !hasTransactionDate && !hasPaymentNote) {
    return res.status(400).json({ error: 'Provide at least one field to update' });
  }
  if (status && !Object.values(PAYMENT_STATUS).includes(status)) {
    return res.status(400).json({ error: 'Invalid payment status' });
  }

  const payment = await getPaymentForMutation(paymentId);
  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }
  if (!canAccessPayment(payment, req.user)) {
    return res.status(403).json({ error: 'Cannot update payment outside your block' });
  }
  if (payment.lockedByAdmin) {
    if (req.user.role === Role.BLOCK_ADMIN) {
      return res.status(400).json({ error: 'Payment is locked after final mark. Raise a dispute ticket for super admin.' });
    }
    return res.status(400).json({ error: 'Payment is locked. Unlock it first before editing.' });
  }

  const updateData = {};

  if (status) {
    updateData.status = status;
    updateData.verified = status === PAYMENT_STATUS.PAID;
    if (status === PAYMENT_STATUS.PAID) {
      const finalTransactionRef = hasTransactionRef ? transactionRef : payment.transactionRef;
      const finalTransactionDate = hasTransactionDate ? transactionDate : payment.transactionDate;

      if (!finalTransactionRef || !finalTransactionDate) {
        return res.status(400).json({ error: 'transactionRef and transactionDate are required when marking payment as paid' });
      }

      updateData.transactionRef = finalTransactionRef;
      updateData.transactionDate = finalTransactionDate;
      updateData.paidAt = new Date();
      updateData.lockedByAdmin = true;
      updateData.lockedAt = new Date();
    } else {
      updateData.paidAt = null;
    }
  }

  if (hasAmount) {
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    updateData.amount = amount;
    updateData.adjustedByAdminId = req.user.id;
  }

  if (hasTransactionRef) updateData.transactionRef = transactionRef;
  if (hasTransactionDate) {
    if (req.body.transactionDate && !transactionDate) {
      return res.status(400).json({ error: 'Invalid transactionDate' });
    }
    updateData.transactionDate = transactionDate;
  }
  if (hasPaymentNote) updateData.paymentNote = paymentNote;
  if (editReason) {
    updateData.lastEditedByAdminId = req.user.id;
    updateData.lastEditReason = editReason;
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: 'No valid changes supplied' });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id: paymentId },
      data: updateData,
      select: paymentMutationSelect,
    });

    const auditAction = status === PAYMENT_STATUS.PAID
      ? 'MARKED_PAID'
      : hasAmount
        ? 'AMOUNT_ADJUSTED'
        : status && status !== payment.status
          ? 'STATUS_UPDATED'
          : 'UPDATED';

    await createPaymentAuditLog(tx, {
      paymentId,
      actorId: req.user.id,
      action: auditAction,
      comment: editReason || paymentNote || null,
      beforeState: snapshotPayment(payment),
      afterState: snapshotPayment(updatedPayment),
      metadata: {
        actorRole: req.user.role,
        autoLocked: updateData.lockedByAdmin === true,
      },
    });

    return updatedPayment;
  });

  return res.json({ payment: updated });
});

router.post('/:id/unlock', authenticate, authorizeRoles(Role.SUPER_ADMIN), async (req, res) => {
  const paymentId = parsePositiveInt(req.params.id);
  const comment = getTrimmedText(req.body.comment);
  const ticketId = parsePositiveInt(req.body.ticketId);

  if (!paymentId) return res.status(400).json({ error: 'Invalid payment id' });
  if (!comment) return res.status(400).json({ error: 'comment is required to unlock payment' });

  const payment = await getPaymentForMutation(paymentId);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (!payment.lockedByAdmin) return res.status(400).json({ error: 'Payment is already unlocked' });

  if (ticketId) {
    const ticket = await prisma.paymentTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, paymentId: true },
    });
    if (!ticket || ticket.paymentId !== paymentId) {
      return res.status(400).json({ error: 'ticketId does not belong to this payment' });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id: paymentId },
      data: {
        lockedByAdmin: false,
        lockedAt: null,
        lastEditedByAdminId: req.user.id,
        lastEditReason: comment,
      },
      select: paymentMutationSelect,
    });

    await createPaymentAuditLog(tx, {
      paymentId,
      actorId: req.user.id,
      ticketId: ticketId || null,
      action: ticketId ? 'UNLOCKED_VIA_TICKET' : 'UNLOCKED',
      comment,
      beforeState: snapshotPayment(payment),
      afterState: snapshotPayment(updatedPayment),
      metadata: {
        actorRole: req.user.role,
      },
    });

    return updatedPayment;
  });

  return res.json({ payment: updated });
});

router.post('/:id/lock', authenticate, authorizeRoles(Role.SUPER_ADMIN), async (req, res) => {
  const paymentId = parsePositiveInt(req.params.id);
  const comment = getTrimmedText(req.body.comment);
  const status = hasOwn(req.body, 'status') ? getTrimmedText(req.body.status)?.toLowerCase() : undefined;
  const hasAmount = hasOwn(req.body, 'amount');
  const hasTransactionRef = hasOwn(req.body, 'transactionRef');
  const transactionRef = hasTransactionRef ? getTrimmedText(req.body.transactionRef) : undefined;
  const hasTransactionDate = hasOwn(req.body, 'transactionDate');
  const transactionDate = hasTransactionDate
    ? (req.body.transactionDate ? toDateOnly(req.body.transactionDate) : null)
    : undefined;
  const hasPaymentNote = hasOwn(req.body, 'paymentNote');
  const paymentNote = hasPaymentNote ? getTrimmedText(req.body.paymentNote) : undefined;

  if (!paymentId) return res.status(400).json({ error: 'Invalid payment id' });
  if (!comment) return res.status(400).json({ error: 'comment is required to lock payment' });
  if (status && !Object.values(PAYMENT_STATUS).includes(status)) {
    return res.status(400).json({ error: 'Invalid payment status' });
  }

  const payment = await getPaymentForMutation(paymentId);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.lockedByAdmin) return res.status(400).json({ error: 'Payment is already locked' });

  const finalStatus = status || payment.status;
  if (finalStatus !== PAYMENT_STATUS.PAID) {
    return res.status(400).json({ error: 'Only paid payments can be locked. Mark the payment as paid while finalizing.' });
  }

  const finalTransactionRef = hasTransactionRef ? transactionRef : payment.transactionRef;
  const finalTransactionDate = hasTransactionDate ? transactionDate : payment.transactionDate;

  if (!finalTransactionRef || !finalTransactionDate) {
    return res.status(400).json({ error: 'transactionRef and transactionDate are required before locking a paid payment' });
  }

  const updateData = {
    status: PAYMENT_STATUS.PAID,
    verified: true,
    transactionRef: finalTransactionRef,
    transactionDate: finalTransactionDate,
    paidAt: new Date(),
    lockedByAdmin: true,
    lockedAt: new Date(),
    lastEditedByAdminId: req.user.id,
    lastEditReason: comment,
  };

  if (hasAmount) {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    updateData.amount = amount;
    updateData.adjustedByAdminId = req.user.id;
  }
  if (hasPaymentNote) updateData.paymentNote = paymentNote;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id: paymentId },
      data: updateData,
      select: paymentMutationSelect,
    });

    await createPaymentAuditLog(tx, {
      paymentId,
      actorId: req.user.id,
      action: 'RELOCKED',
      comment,
      beforeState: snapshotPayment(payment),
      afterState: snapshotPayment(updatedPayment),
      metadata: {
        actorRole: req.user.role,
      },
    });

    return updatedPayment;
  });

  return res.json({ payment: updated });
});

router.delete('/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN), async (req, res) => {
  const paymentId = parsePositiveInt(req.params.id);
  const reason = getTrimmedText(req.body.reason || req.query.reason);

  if (!paymentId) return res.status(400).json({ error: 'Invalid payment id' });
  if (!reason) return res.status(400).json({ error: 'reason is required to delete payment' });

  const existing = await getPaymentForMutation(paymentId);
  if (!existing) return res.status(404).json({ error: 'Payment not found' });

  await prisma.$transaction(async (tx) => {
    await createPaymentAuditLog(tx, {
      paymentId,
      actorId: req.user.id,
      action: 'DELETED',
      comment: reason,
      beforeState: snapshotPayment(existing),
      afterState: null,
      metadata: {
        actorRole: req.user.role,
      },
    });

    await tx.payment.delete({ where: { id: paymentId } });
  });

  return res.json({ message: 'Payment deleted by super admin', reason, payment: existing });
});

router.post('/:id/tickets', authenticate, authorizeRoles(Role.BLOCK_ADMIN), async (req, res) => {
  const paymentId = parsePositiveInt(req.params.id);
  const reason = getTrimmedText(req.body.reason);

  if (!paymentId) return res.status(400).json({ error: 'Invalid payment id' });
  if (!reason) return res.status(400).json({ error: 'reason is required' });

  const payment = await getPaymentForMutation(paymentId);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (!canAccessPayment(payment, req.user)) {
    return res.status(403).json({ error: 'Cannot raise dispute outside your block' });
  }
  if (!payment.lockedByAdmin) {
    return res.status(400).json({ error: 'Only locked payments require a dispute ticket. This payment can still be edited directly.' });
  }

  const existingOpenTicket = await prisma.paymentTicket.findFirst({
    where: {
      paymentId,
      status: PAYMENT_TICKET_STATUS.OPEN,
    },
    select: { id: true },
  });
  if (existingOpenTicket) {
    return res.status(409).json({ error: `An open dispute already exists for this payment (ticket #${existingOpenTicket.id})` });
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const createdTicket = await createWithNumericId(tx, 'paymentTicket', {
      data: {
        paymentId,
        raisedById: req.user.id,
        reason,
        status: PAYMENT_TICKET_STATUS.OPEN,
      },
      select: {
        id: true,
        paymentId: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    });

    await createPaymentAuditLog(tx, {
      paymentId,
      actorId: req.user.id,
      ticketId: createdTicket.id,
      action: 'DISPUTE_RAISED',
      comment: reason,
      beforeState: snapshotPayment(payment),
      afterState: snapshotPayment(payment),
      metadata: {
        actorRole: req.user.role,
        ticketStatus: PAYMENT_TICKET_STATUS.OPEN,
      },
    });

    return createdTicket;
  });

  return res.status(201).json({ ticket });
});

router.get('/tickets/list', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const where = {};

  if (req.user.role === Role.BLOCK_ADMIN) {
    where.raisedById = req.user.id;
  }
  if (req.query.status && Object.values(PAYMENT_TICKET_STATUS).includes(req.query.status)) {
    where.status = req.query.status;
  }
  if (parseBoolean(req.query.openOnly) === true) {
    where.status = PAYMENT_TICKET_STATUS.OPEN;
  }

  const [total, tickets] = await prisma.$transaction([
    prisma.paymentTicket.count({ where }),
    prisma.paymentTicket.findMany({
      where,
      take: limit,
      skip,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        paymentId: true,
        reason: true,
        status: true,
        adminNote: true,
        createdAt: true,
        updatedAt: true,
        raisedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
        payment: {
          select: {
            id: true,
            amount: true,
            status: true,
            transactionRef: true,
            transactionDate: true,
            lockedByAdmin: true,
            lockedAt: true,
            worker: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            order: {
              select: {
                id: true,
                blockId: true,
                block: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return res.json({
    tickets,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

router.patch('/tickets/:id/review', authenticate, authorizeRoles(Role.SUPER_ADMIN), async (req, res) => {
  const ticketId = parsePositiveInt(req.params.id);
  const status = getTrimmedText(req.body.status)?.toUpperCase();
  const adminNote = getTrimmedText(req.body.adminNote);
  const resolutionAction = getTrimmedText(req.body.resolutionAction)?.toUpperCase() || null;

  if (!ticketId) return res.status(400).json({ error: 'Invalid ticket id' });
  if (!status || !Object.values(PAYMENT_TICKET_STATUS).includes(status)) {
    return res.status(400).json({ error: 'Invalid ticket status' });
  }
  if (resolutionAction && resolutionAction !== 'UNLOCK') {
    return res.status(400).json({ error: 'Unsupported resolutionAction' });
  }
  if (resolutionAction === 'UNLOCK' && !adminNote) {
    return res.status(400).json({ error: 'adminNote is required when resolving a dispute by unlocking payment' });
  }
  if (resolutionAction === 'UNLOCK' && ![PAYMENT_TICKET_STATUS.APPROVED, PAYMENT_TICKET_STATUS.RESOLVED].includes(status)) {
    return res.status(400).json({ error: 'Unlock resolution requires APPROVED or RESOLVED ticket status' });
  }

  const ticket = await prisma.paymentTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      paymentId: true,
      status: true,
      reason: true,
      payment: {
        select: paymentMutationSelect,
      },
    },
  });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  if (resolutionAction === 'UNLOCK' && !ticket.payment?.lockedByAdmin) {
    return res.status(400).json({ error: 'Payment is already unlocked' });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedTicket = await tx.paymentTicket.update({
      where: { id: ticketId },
      data: {
        status,
        adminNote,
        reviewedById: req.user.id,
      },
      select: {
        id: true,
        paymentId: true,
        status: true,
        adminNote: true,
        reviewedById: true,
        updatedAt: true,
      },
    });

    await createPaymentAuditLog(tx, {
      paymentId: ticket.paymentId,
      actorId: req.user.id,
      ticketId,
      action: 'DISPUTE_REVIEWED',
      comment: adminNote || `Ticket moved to ${status}.`,
      beforeState: snapshotPayment(ticket.payment),
      afterState: snapshotPayment(ticket.payment),
      metadata: {
        previousTicketStatus: ticket.status,
        nextTicketStatus: status,
        resolutionAction,
      },
    });

    let updatedPayment = null;
    if (resolutionAction === 'UNLOCK') {
      updatedPayment = await tx.payment.update({
        where: { id: ticket.paymentId },
        data: {
          lockedByAdmin: false,
          lockedAt: null,
          lastEditedByAdminId: req.user.id,
          lastEditReason: adminNote,
        },
        select: paymentMutationSelect,
      });

      await createPaymentAuditLog(tx, {
        paymentId: ticket.paymentId,
        actorId: req.user.id,
        ticketId,
        action: 'UNLOCKED_VIA_TICKET',
        comment: adminNote,
        beforeState: snapshotPayment(ticket.payment),
        afterState: snapshotPayment(updatedPayment),
        metadata: {
          actorRole: req.user.role,
          resolutionAction,
        },
      });
    }

    return { ticket: updatedTicket, payment: updatedPayment };
  });

  return res.json(result);
});

module.exports = router;
