const express = require('express');
const { Role } = require('@prisma/client');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { parsePositiveInt, validateComplaintType } = require('../utils/validators');
const {
  ATTENDANCE_STATUS,
  PAYMENT_STATUS,
  ORDER_STATUS,
  COMPLAINT_TYPE,
} = require('../utils/constants');
const { getPagination } = require('../utils/pagination');
const { toDateOnly } = require('../utils/date');
const prisma = require('../lib/prisma');
const {
  createWithNumericId,
  upsertWithNumericId,
} = require('../lib/numericIds');
const router = express.Router();

router.post('/mark', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const workerId = parsePositiveInt(req.body.workerId ?? req.body.worker_id);
  const orderId = parsePositiveInt(req.body.orderId ?? req.body.order_id);
  const attendanceDate = toDateOnly(req.body.date);
  const status = req.body.status;

  if (!workerId || !orderId || !attendanceDate) {
    return res.status(400).json({ error: 'workerId, orderId and valid date are required' });
  }

  if (![ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.ABSENT].includes(status)) {
    return res.status(400).json({ error: 'status must be present or absent' });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, blockId: true, rate: true },
  });

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (req.user.role === Role.BLOCK_ADMIN && order.blockId !== req.user.blockId) {
    return res.status(403).json({ error: 'Cannot mark attendance outside your block' });
  }

  const orderWorker = await prisma.orderWorker.findUnique({
    where: {
      orderId_workerId: {
        orderId,
        workerId,
      },
    },
    select: { id: true },
  });

  if (!orderWorker) {
    return res.status(400).json({ error: 'Worker is not assigned to this order' });
  }

  const attendance = await upsertWithNumericId(prisma, 'attendance', {
    where: {
      workerId_orderId_date: {
        workerId,
        orderId,
        date: attendanceDate,
      },
    },
    create: {
      workerId,
      orderId,
      date: attendanceDate,
      status,
      confirmed: false,
      customerConfirmed: null,
    },
    update: {
      status,
      confirmed: false,
      customerConfirmed: null,
    },
    select: {
      id: true,
      workerId: true,
      orderId: true,
      date: true,
      status: true,
      confirmed: true,
      customerConfirmed: true,
    },
  });

  if (status === ATTENDANCE_STATUS.ABSENT) {
    await prisma.payment.updateMany({
      where: {
        workerId,
        date: attendanceDate,
      },
      data: {
        status: PAYMENT_STATUS.FAILED,
        verified: false,
      },
    });
  }

  return res.json({ attendance });
});

router.post('/confirm', authenticate, authorizeRoles(Role.CUSTOMER), async (req, res) => {
  const orderId = parsePositiveInt(req.body.orderId ?? req.body.order_id);
  const confirmationDate = toDateOnly(req.body.date);
  const confirmed = req.body.confirmed;
  const complaintTypeInput = req.body.complaintType || req.body.complaint_type;
  const complaintDetails = req.body.complaintDetails || req.body.complaint_details;

  if (!orderId || !confirmationDate || typeof confirmed !== 'boolean') {
    return res.status(400).json({ error: 'orderId, date and confirmed(boolean) are required' });
  }

  const customer = await prisma.customer.findUnique({
    where: { userId: req.user.id },
    select: { id: true },
  });

  if (!customer) {
    return res.status(404).json({ error: 'Customer profile not found' });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customerId: true,
      blockId: true,
      rate: true,
    },
  });

  if (!order || order.customerId !== customer.id) {
    return res.status(404).json({ error: 'Order not found for this customer' });
  }

  const attendances = await prisma.attendance.findMany({
    where: {
      orderId,
      date: confirmationDate,
    },
    select: {
      id: true,
      workerId: true,
      status: true,
      date: true,
      orderId: true,
    },
  });

  if (attendances.length === 0) {
    return res.status(400).json({ error: 'Attendance must be marked before confirmation' });
  }

  await prisma.attendance.updateMany({
    where: {
      orderId,
      date: confirmationDate,
    },
    data: {
      customerConfirmed: confirmed,
      confirmed,
    },
  });

  let disputeComplaint = null;

  if (confirmed) {
    await prisma.$transaction(async (tx) => {
      for (const attendance of attendances) {
        if (attendance.status !== ATTENDANCE_STATUS.PRESENT) {
          continue;
        }

        const existing = await tx.payment.findUnique({
          where: {
            workerId_date: {
              workerId: attendance.workerId,
              date: attendance.date,
            },
          },
          select: { id: true },
        });

        if (!existing) {
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

      await tx.order.update({
        where: { id: orderId },
        data: { status: ORDER_STATUS.ONGOING },
      });
    });
  } else {
    const complaintType = complaintTypeInput
      ? (complaintTypeInput === 'quality' ? COMPLAINT_TYPE.POOR_QUALITY : complaintTypeInput)
      : COMPLAINT_TYPE.POOR_QUALITY;

    if (!validateComplaintType(complaintType)) {
      return res.status(400).json({ error: 'Invalid complaint type' });
    }

    disputeComplaint = await createWithNumericId(prisma, 'complaint', {
      data: {
        customerId: customer.id,
        orderId,
        type: complaintType === 'quality' ? COMPLAINT_TYPE.POOR_QUALITY : complaintType,
        details: String(complaintDetails || 'Customer did not confirm attendance and raised a dispute').trim(),
      },
      select: {
        id: true,
        orderId: true,
        type: true,
        details: true,
        status: true,
        createdAt: true,
      },
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { status: ORDER_STATUS.ASSIGNED },
    });
  }

  return res.json({
    orderId,
    date: confirmationDate,
    confirmed,
    complaint: disputeComplaint,
  });
});

router.get('/', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN, Role.CUSTOMER, Role.CSC_AGENT), async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const where = {};

  if (req.user.role === Role.BLOCK_ADMIN || req.user.role === Role.CSC_AGENT) {
    where.order = { blockId: req.user.blockId };
  }

  if (req.user.role === Role.CUSTOMER) {
    const customer = await prisma.customer.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer profile not found' });
    }

    where.order = { customerId: customer.id };
  }

  if (req.query.orderId) {
    const orderId = parsePositiveInt(req.query.orderId);
    if (orderId) {
      where.orderId = orderId;
    }
  }

  if (req.query.workerId) {
    const workerId = parsePositiveInt(req.query.workerId);
    if (workerId) {
      where.workerId = workerId;
    }
  }

  const [total, attendances] = await prisma.$transaction([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      take: limit,
      skip,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        date: true,
        status: true,
        confirmed: true,
        customerConfirmed: true,
        worker: {
          select: {
            id: true,
            name: true,
            phone: true,
            category: true,
          },
        },
        order: {
          select: {
            id: true,
            category: true,
            block: true,
            blockId: true,
            status: true,
          },
        },
      },
    }),
  ]);

  return res.json({
    attendances,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

module.exports = router;
