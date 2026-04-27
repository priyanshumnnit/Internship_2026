const express = require('express');
const { Role } = require('@prisma/client');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { parsePositiveInt } = require('../utils/validators');
const { getPagination } = require('../utils/pagination');
const { CUSTOMER_PAYMENT_STATUS, REFUND_STATUS } = require('../utils/constants');
const { toDateOnly } = require('../utils/date');
const prisma = require('../lib/prisma');
const { createWithNumericId } = require('../lib/numericIds');

const router = express.Router();

const refundSelect = {
  id: true,
  orderId: true,
  amount: true,
  reason: true,
  note: true,
  status: true,
  transactionRef: true,
  refundedAt: true,
  createdAt: true,
  updatedAt: true,
  order: {
    select: {
      id: true,
      total: true,
      customerPaymentStatus: true,
      customerPaidAt: true,
      state: true,
      district: true,
      block: true,
      blockId: true,
      customer: {
        select: {
          id: true,
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
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  updatedBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
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

function canAccessOrder(order, user) {
  if (!order) return false;
  if (user.role !== Role.BLOCK_ADMIN) return true;
  return order.blockId === user.blockId;
}

async function getRefundById(refundId) {
  return prisma.orderRefund.findUnique({
    where: { id: refundId },
    select: refundSelect,
  });
}

async function validateRefundCapacity({
  orderId,
  amount,
  nextStatus,
  excludeRefundId = null,
}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      total: true,
      blockId: true,
      customerPaymentStatus: true,
    },
  });

  if (!order) {
    return { ok: false, status: 404, error: 'Order not found' };
  }

  if (order.customerPaymentStatus !== CUSTOMER_PAYMENT_STATUS.PAID) {
    return { ok: false, status: 400, error: 'Refunds can only be created for orders with verified customer payment' };
  }

  if (![REFUND_STATUS.PENDING, REFUND_STATUS.PROCESSED].includes(nextStatus)) {
    return { ok: true, order };
  }

  const activeRefunds = await prisma.orderRefund.aggregate({
    where: {
      orderId,
      status: {
        in: [REFUND_STATUS.PENDING, REFUND_STATUS.PROCESSED],
      },
      ...(excludeRefundId ? { NOT: { id: excludeRefundId } } : {}),
    },
    _sum: {
      amount: true,
    },
  });

  const nextTotal = (activeRefunds._sum.amount || 0) + amount;
  if (nextTotal > order.total + 0.0001) {
    return {
      ok: false,
      status: 400,
      error: `Refund total exceeds customer payment. Remaining refundable balance is INR ${Math.max(order.total - (activeRefunds._sum.amount || 0), 0).toFixed(2)}`,
    };
  }

  return { ok: true, order };
}

router.get('/', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const baseWhere = {};

  if (req.user.role === Role.BLOCK_ADMIN) {
    baseWhere.order = { blockId: req.user.blockId };
  }

  if (req.query.orderId) {
    const orderId = parsePositiveInt(req.query.orderId);
    if (orderId) {
      baseWhere.orderId = orderId;
    }
  }

  const where = { ...baseWhere };
  const status = getTrimmedText(req.query.status);
  if (status && Object.values(REFUND_STATUS).includes(status)) {
    where.status = status;
  }

  const [
    total,
    refunds,
    processedSummary,
    pendingSummary,
    cancelledCount,
  ] = await prisma.$transaction([
    prisma.orderRefund.count({ where }),
    prisma.orderRefund.findMany({
      where,
      take: limit,
      skip,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: refundSelect,
    }),
    prisma.orderRefund.aggregate({
      where: { ...baseWhere, status: REFUND_STATUS.PROCESSED },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.orderRefund.aggregate({
      where: { ...baseWhere, status: REFUND_STATUS.PENDING },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.orderRefund.count({
      where: { ...baseWhere, status: REFUND_STATUS.CANCELLED },
    }),
  ]);

  return res.json({
    refunds,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    summary: {
      processedAmount: processedSummary._sum.amount || 0,
      processedCount: processedSummary._count._all || 0,
      pendingAmount: pendingSummary._sum.amount || 0,
      pendingCount: pendingSummary._count._all || 0,
      cancelledCount,
    },
  });
});

router.post('/', authenticate, authorizeRoles(Role.SUPER_ADMIN), async (req, res) => {
  const orderId = parsePositiveInt(req.body.orderId ?? req.body.order_id);
  const amount = Number(req.body.amount);
  const reason = getTrimmedText(req.body.reason);
  const note = getTrimmedText(req.body.note);
  const requestedStatus = getTrimmedText(req.body.status) || REFUND_STATUS.PROCESSED;
  const transactionRef = getTrimmedText(req.body.transactionRef);
  const refundedAt = req.body.refundedAt ? toDateOnly(req.body.refundedAt) : null;

  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!reason) {
    return res.status(400).json({ error: 'reason is required' });
  }
  if (!Object.values(REFUND_STATUS).includes(requestedStatus)) {
    return res.status(400).json({ error: 'Invalid refund status' });
  }

  const capacity = await validateRefundCapacity({
    orderId,
    amount,
    nextStatus: requestedStatus,
  });
  if (!capacity.ok) {
    return res.status(capacity.status).json({ error: capacity.error });
  }

  const refund = await createWithNumericId(prisma, 'orderRefund', {
    data: {
      orderId,
      amount,
      reason,
      note,
      status: requestedStatus,
      transactionRef,
      refundedAt: requestedStatus === REFUND_STATUS.PROCESSED ? (refundedAt || new Date()) : null,
      createdById: req.user.id,
    },
    select: refundSelect,
  });

  return res.status(201).json({ refund });
});

router.patch('/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN), async (req, res) => {
  const refundId = parsePositiveInt(req.params.id);
  if (!refundId) {
    return res.status(400).json({ error: 'Invalid refund id' });
  }

  const existing = await getRefundById(refundId);
  if (!existing) {
    return res.status(404).json({ error: 'Refund not found' });
  }

  const updateData = {};

  if (hasOwn(req.body, 'amount')) {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    updateData.amount = amount;
  }

  if (hasOwn(req.body, 'reason')) {
    const reason = getTrimmedText(req.body.reason);
    if (!reason) {
      return res.status(400).json({ error: 'reason cannot be empty' });
    }
    updateData.reason = reason;
  }

  if (hasOwn(req.body, 'note')) {
    updateData.note = getTrimmedText(req.body.note);
  }

  if (hasOwn(req.body, 'transactionRef')) {
    updateData.transactionRef = getTrimmedText(req.body.transactionRef);
  }

  if (hasOwn(req.body, 'status')) {
    const nextStatus = getTrimmedText(req.body.status);
    if (!Object.values(REFUND_STATUS).includes(nextStatus)) {
      return res.status(400).json({ error: 'Invalid refund status' });
    }
    updateData.status = nextStatus;
  }

  if (hasOwn(req.body, 'refundedAt')) {
    if (req.body.refundedAt) {
      const nextRefundedAt = toDateOnly(req.body.refundedAt);
      if (!nextRefundedAt) {
        return res.status(400).json({ error: 'Invalid refundedAt date' });
      }
      updateData.refundedAt = nextRefundedAt;
    } else {
      updateData.refundedAt = null;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: 'Provide at least one field to update' });
  }

  const nextAmount = updateData.amount ?? existing.amount;
  const nextStatus = updateData.status ?? existing.status;

  const capacity = await validateRefundCapacity({
    orderId: existing.orderId,
    amount: nextAmount,
    nextStatus,
    excludeRefundId: refundId,
  });
  if (!capacity.ok) {
    return res.status(capacity.status).json({ error: capacity.error });
  }

  if (!hasOwn(updateData, 'refundedAt')) {
    if (nextStatus === REFUND_STATUS.PROCESSED) {
      updateData.refundedAt = existing.refundedAt || new Date();
    } else {
      updateData.refundedAt = null;
    }
  }

  updateData.updatedById = req.user.id;

  const refund = await prisma.orderRefund.update({
    where: { id: refundId },
    data: updateData,
    select: refundSelect,
  });

  return res.json({ refund });
});

router.get('/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const refundId = parsePositiveInt(req.params.id);
  if (!refundId) {
    return res.status(400).json({ error: 'Invalid refund id' });
  }

  const refund = await getRefundById(refundId);
  if (!refund) {
    return res.status(404).json({ error: 'Refund not found' });
  }
  if (!canAccessOrder(refund.order, req.user)) {
    return res.status(403).json({ error: 'Cannot view refund outside your block' });
  }

  return res.json({ refund });
});

module.exports = router;
