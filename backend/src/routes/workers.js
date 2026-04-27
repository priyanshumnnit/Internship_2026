const express = require('express');
const { Role } = require('@prisma/client');
const {
  authenticate,
  authorizeRoles,
  requireApprovedCsc,
} = require('../middleware/auth');
const {
  normalizePhone,
  validatePhone,
  parsePositiveInt,
} = require('../utils/validators');
const {
  WORKER_STATUS,
  WORKER_APPROVAL_STATUS,
} = require('../utils/constants');
const { getPagination } = require('../utils/pagination');
const prisma = require('../lib/prisma');
const { createWithNumericId } = require('../lib/numericIds');
const router = express.Router();

const allowedStatuses = Object.values(WORKER_STATUS);
const allowedApprovalStatuses = Object.values(WORKER_APPROVAL_STATUS);

async function resolveViewerBlockId(user) {
  if (user.role === Role.BLOCK_ADMIN || user.role === Role.CSC_AGENT) {
    return user.blockId;
  }

  if (user.role === Role.CUSTOMER) {
    const customer = await prisma.customer.findUnique({
      where: { userId: user.id },
      select: { blockId: true },
    });
    return customer?.blockId || null;
  }

  return null;
}

router.post('/', authenticate, authorizeRoles(Role.CSC_AGENT), requireApprovedCsc, async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const name = String(req.body.name || '').trim();
  const category = String(req.body.category || '').trim().toLowerCase();
  const photoUrl = req.body.photo_url || req.body.photoUrl || null;
  const aadhaarUrl = req.body.aadhaar_url || req.body.aadhaarUrl || null;
  const bankUrl = req.body.bank_url || req.body.bankUrl || null;

  if (!name || !phone || !category) {
    return res.status(400).json({ error: 'name, phone and category are required' });
  }

  if (!validatePhone(phone)) {
    return res.status(400).json({ error: 'Invalid worker phone format' });
  }

  if (!req.user.stateId || !req.user.districtId || !req.user.blockId) {
    return res.status(400).json({ error: 'CSC location is incomplete. Contact admin to update your block assignment.' });
  }

  const duplicate = await prisma.worker.findUnique({ where: { phone } });
  if (duplicate) {
    return res.status(409).json({ error: 'Worker already exists for this phone' });
  }

  const worker = await createWithNumericId(prisma, 'worker', {
    data: {
      name,
      phone,
      category,
      state: req.user.state,
      district: req.user.district,
      block: req.user.block,
      stateId: req.user.stateId,
      districtId: req.user.districtId,
      blockId: req.user.blockId,
      status: WORKER_STATUS.INACTIVE,
      approvalStatus: WORKER_APPROVAL_STATUS.PENDING,
      isAvailable: false,
      photoUrl,
      aadhaarUrl,
      bankUrl,
      createdByCscAgentId: req.user.id,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      category: true,
      state: true,
      district: true,
      block: true,
      stateId: true,
      districtId: true,
      blockId: true,
      status: true,
      approvalStatus: true,
      isAvailable: true,
      createdByCscAgentId: true,
      createdAt: true,
    },
  });

  return res.status(201).json({ worker });
});

router.get('/', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN, Role.CSC_AGENT, Role.CUSTOMER), async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const where = {};
  const viewerBlockId = await resolveViewerBlockId(req.user);

  if (viewerBlockId) {
    where.blockId = viewerBlockId;
  }

  if (req.query.category) {
    where.category = String(req.query.category).trim().toLowerCase();
  }

  if (req.query.status && allowedStatuses.includes(req.query.status)) {
    where.status = req.query.status;
  }

  if (req.query.approvalStatus && allowedApprovalStatuses.includes(req.query.approvalStatus)) {
    where.approvalStatus = req.query.approvalStatus;
  }

  if (typeof req.query.isAvailable !== 'undefined') {
    where.isAvailable = req.query.isAvailable === 'true';
  }

  if (req.user.role === Role.CSC_AGENT && req.query.mine === 'true') {
    where.createdByCscAgentId = req.user.id;
  }

  const [total, workers] = await prisma.$transaction([
    prisma.worker.count({ where }),
    prisma.worker.findMany({
      where,
      take: limit,
      skip,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        phone: true,
        category: true,
        state: true,
        district: true,
        block: true,
        stateId: true,
        districtId: true,
        blockId: true,
        status: true,
        approvalStatus: true,
        approvalNote: true,
        isAvailable: true,
        rating: true,
        activeJobs: true,
        totalJobs: true,
        createdAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return res.json({
    workers,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

router.get('/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN, Role.CSC_AGENT, Role.CUSTOMER), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid worker id' });
  }

  const worker = await prisma.worker.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      category: true,
      state: true,
      district: true,
      block: true,
      stateId: true,
      districtId: true,
      blockId: true,
      status: true,
      approvalStatus: true,
      approvalNote: true,
      isAvailable: true,
      rating: true,
      activeJobs: true,
      totalJobs: true,
      photoUrl: true,
      aadhaarUrl: true,
      bankUrl: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!worker) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  const viewerBlockId = await resolveViewerBlockId(req.user);
  if (viewerBlockId && worker.blockId !== viewerBlockId) {
    return res.status(403).json({ error: 'Cannot access worker outside your block' });
  }

  return res.json({ worker });
});

router.patch('/:id/approval', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  const approvalStatus = String(req.body.approvalStatus || '').toUpperCase();
  const approvalNote = req.body.approvalNote ? String(req.body.approvalNote) : null;

  if (!id) {
    return res.status(400).json({ error: 'Invalid worker id' });
  }

  if (![WORKER_APPROVAL_STATUS.APPROVED, WORKER_APPROVAL_STATUS.REJECTED].includes(approvalStatus)) {
    return res.status(400).json({ error: 'approvalStatus must be APPROVED or REJECTED' });
  }

  const worker = await prisma.worker.findUnique({
    where: { id },
    select: {
      id: true,
      blockId: true,
      activeJobs: true,
    },
  });

  if (!worker) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  if (req.user.role === Role.BLOCK_ADMIN && worker.blockId !== req.user.blockId) {
    return res.status(403).json({ error: 'Cannot approve workers outside your block' });
  }

  const updated = await prisma.worker.update({
    where: { id },
    data: {
      approvalStatus,
      approvalNote,
      status: approvalStatus === WORKER_APPROVAL_STATUS.APPROVED
        ? (worker.activeJobs > 0 ? WORKER_STATUS.BUSY : WORKER_STATUS.ACTIVE)
        : WORKER_STATUS.SUSPENDED,
      isAvailable: approvalStatus === WORKER_APPROVAL_STATUS.APPROVED
        ? worker.activeJobs === 0
        : false,
    },
    select: {
      id: true,
      name: true,
      block: true,
      blockId: true,
      status: true,
      approvalStatus: true,
      approvalNote: true,
      isAvailable: true,
    },
  });

  return res.json({ worker: updated });
});

router.patch('/:id/status', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  const status = req.body.status;
  const isAvailable = req.body.isAvailable;

  if (!id) {
    return res.status(400).json({ error: 'Invalid worker id' });
  }

  const worker = await prisma.worker.findUnique({
    where: { id },
    select: {
      id: true,
      blockId: true,
      approvalStatus: true,
      activeJobs: true,
    },
  });

  if (!worker) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  if (req.user.role === Role.BLOCK_ADMIN && worker.blockId !== req.user.blockId) {
    return res.status(403).json({ error: 'Cannot modify workers outside your block' });
  }

  if (worker.approvalStatus !== WORKER_APPROVAL_STATUS.APPROVED && (status === WORKER_STATUS.ACTIVE || status === WORKER_STATUS.BUSY)) {
    return res.status(400).json({ error: 'Worker must be approved before becoming active or busy' });
  }

  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid worker status' });
  }

  const updateData = {};
  if (status) {
    updateData.status = status;
  }

  if (typeof isAvailable === 'boolean') {
    updateData.isAvailable = isAvailable;
  }

  const updated = await prisma.worker.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      block: true,
      blockId: true,
      status: true,
      approvalStatus: true,
      isAvailable: true,
      activeJobs: true,
      totalJobs: true,
    },
  });

  return res.json({ worker: updated });
});

router.get('/:id/passbook', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN, Role.CSC_AGENT), async (req, res) => {
  const workerId = parsePositiveInt(req.params.id);
  if (!workerId) {
    return res.status(400).json({ error: 'Invalid worker id' });
  }

  const worker = await prisma.worker.findUnique({
    where: { id: workerId },
    select: {
      id: true,
      name: true,
      block: true,
      blockId: true,
    },
  });

  if (!worker) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  if ((req.user.role === Role.BLOCK_ADMIN || req.user.role === Role.CSC_AGENT) && worker.blockId !== req.user.blockId) {
    return res.status(403).json({ error: 'Cannot access passbook outside your block' });
  }

  const { page, limit, skip } = getPagination(req.query);

  const [total, entries] = await prisma.$transaction([
    prisma.payment.count({ where: { workerId } }),
    prisma.payment.findMany({
      where: { workerId },
      take: limit,
      skip,
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        orderId: true,
        amount: true,
        status: true,
        transactionRef: true,
        transactionDate: true,
        paymentNote: true,
        paidAt: true,
        lockedByAdmin: true,
        order: {
          select: {
            id: true,
            category: true,
            status: true,
            block: true,
            district: true,
            state: true,
          },
        },
      },
    }),
  ]);

  return res.json({
    worker,
    passbook: entries,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

module.exports = router;
