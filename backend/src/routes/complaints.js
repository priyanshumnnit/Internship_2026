const express = require('express');
const { Role } = require('@prisma/client');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { parsePositiveInt, validateComplaintType } = require('../utils/validators');
const { COMPLAINT_TYPE } = require('../utils/constants');
const { getPagination } = require('../utils/pagination');
const prisma = require('../lib/prisma');
const { createWithNumericId } = require('../lib/numericIds');
const router = express.Router();

function normalizeComplaintType(type) {
  if (!type) {
    return null;
  }

  if (type === 'quality') {
    return COMPLAINT_TYPE.POOR_QUALITY;
  }

  return type;
}

router.post('/', authenticate, authorizeRoles(Role.CUSTOMER), async (req, res) => {
  const orderId = parsePositiveInt(req.body.orderId ?? req.body.order_id);
  const workerId = req.body.workerId ?? req.body.worker_id;
  const complaintType = normalizeComplaintType(req.body.type);
  const details = String(req.body.details || '').trim();

  if (!orderId || !complaintType || !details) {
    return res.status(400).json({ error: 'orderId, type and details are required' });
  }

  if (!validateComplaintType(complaintType)) {
    return res.status(400).json({ error: 'Invalid complaint type' });
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
    select: { id: true, customerId: true },
  });

  if (!order || order.customerId !== customer.id) {
    return res.status(403).json({ error: 'Cannot raise complaint for another customer order' });
  }

  let parsedWorkerId = null;
  if (workerId != null && String(workerId).trim() !== '') {
    parsedWorkerId = parsePositiveInt(workerId);
    if (!parsedWorkerId) {
      return res.status(400).json({ error: 'Invalid workerId' });
    }

    const assignment = await prisma.orderWorker.findUnique({
      where: {
        orderId_workerId: {
          orderId,
          workerId: parsedWorkerId,
        },
      },
      select: { id: true },
    });

    if (!assignment) {
      return res.status(400).json({ error: 'Provided worker is not assigned to this order' });
    }
  }

  const complaint = await createWithNumericId(prisma, 'complaint', {
    data: {
      customerId: customer.id,
      orderId,
      workerId: parsedWorkerId,
      type: complaintType,
      details,
    },
    select: {
      id: true,
      customerId: true,
      orderId: true,
      workerId: true,
      type: true,
      details: true,
      status: true,
      resolution: true,
      createdAt: true,
    },
  });

  return res.status(201).json({ complaint });
});

router.get('/', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN, Role.CUSTOMER), async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const where = {};

  if (req.user.role === Role.BLOCK_ADMIN) {
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

    where.customerId = customer.id;
  }

  if (req.query.status) {
    where.status = req.query.status;
  }

  const [total, complaints] = await prisma.$transaction([
    prisma.complaint.count({ where }),
    prisma.complaint.findMany({
      where,
      take: limit,
      skip,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        details: true,
        status: true,
        resolution: true,
        createdAt: true,
        updatedAt: true,
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
            state: true,
            district: true,
            block: true,
            blockId: true,
            status: true,
            category: true,
          },
        },
        customer: {
          select: {
            id: true,
            state: true,
            district: true,
            block: true,
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
    }),
  ]);

  return res.json({
    complaints,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

router.patch('/:id/resolve', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const complaintId = parsePositiveInt(req.params.id);
  const status = req.body.status;
  const resolution = req.body.resolution ? String(req.body.resolution).trim() : null;

  if (!complaintId) {
    return res.status(400).json({ error: 'Invalid complaint id' });
  }

  if (!['REVIEWED', 'RESOLVED'].includes(status)) {
    return res.status(400).json({ error: 'status must be REVIEWED or RESOLVED' });
  }

  if (status === 'RESOLVED' && !resolution) {
    return res.status(400).json({ error: 'resolution is required when status is RESOLVED' });
  }

  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId },
    select: {
      id: true,
      order: { select: { blockId: true } },
    },
  });

  if (!complaint) {
    return res.status(404).json({ error: 'Complaint not found' });
  }

  if (req.user.role === Role.BLOCK_ADMIN && complaint.order.blockId !== req.user.blockId) {
    return res.status(403).json({ error: 'Cannot resolve complaint outside your block' });
  }

  const updated = await prisma.complaint.update({
    where: { id: complaintId },
    data: {
      status,
      resolution: resolution || undefined,
    },
    select: {
      id: true,
      type: true,
      details: true,
      status: true,
      resolution: true,
      updatedAt: true,
    },
  });

  return res.json({ complaint: updated });
});

module.exports = router;
