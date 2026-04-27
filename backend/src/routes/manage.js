const express = require('express');
const bcrypt = require('bcryptjs');
const { Role } = require('@prisma/client');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  normalizeEmail,
  normalizePhone,
  validateEmail,
  validatePhone,
  validatePassword,
} = require('../utils/validators');
const { CSC_STATUS } = require('../utils/constants');
const { getPagination } = require('../utils/pagination');
const { resolveLocationByIds } = require('../services/location');
const prisma = require('../lib/prisma');
const { createWithNumericId } = require('../lib/numericIds');
const router = express.Router();

function hasCompleteCscDocuments(document) {
  if (!document) return false;

  return Boolean(
    document.aadhaarUrl
    && (document.licenseUrl || document.bankPassbookUrl)
    && (
      document.verificationCertificateUrl
      || document.cscIdOrVleCertificateUrl
      || document.characterCertificateUrl
    ),
  );
}

router.post('/block-admin', authenticate, authorizeRoles(Role.SUPER_ADMIN), async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const phone = normalizePhone(req.body.phone);
  const password = req.body.password;
  const name = String(req.body.name || 'Block Admin').trim();

  if (!email && !phone) {
    return res.status(400).json({ error: 'Email or phone is required' });
  }

  if (email && !validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (phone && !validatePhone(phone)) {
    return res.status(400).json({ error: 'Invalid phone format' });
  }

  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const stateId = String(req.body.stateId || '').trim();
  const districtId = String(req.body.districtId || '').trim();
  const blockId = String(req.body.blockId || '').trim();

  let location;
  try {
    location = await resolveLocationByIds(prisma, { stateId, districtId, blockId });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const duplicateWhere = [];
  if (email) duplicateWhere.push({ email });
  if (phone) duplicateWhere.push({ phone });

  const existing = await prisma.user.findFirst({ where: { OR: duplicateWhere } });
  if (existing) {
    return res.status(409).json({ error: 'User already exists for provided email/phone' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await createWithNumericId(prisma, 'user', {
    data: {
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      password: hashedPassword,
      role: Role.BLOCK_ADMIN,
      name,
      state: location.state.name,
      district: location.district.name,
      block: location.block.name,
      stateId: location.state.id,
      districtId: location.district.id,
      blockId: location.block.id,
    },
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      name: true,
      state: true,
      district: true,
      block: true,
      stateId: true,
      districtId: true,
      blockId: true,
    },
  });

  return res.status(201).json({ user });
});

router.get('/csc-agents', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const where = {
    role: Role.CSC_AGENT,
  };

  if (req.user.role === Role.BLOCK_ADMIN) {
    where.blockId = req.user.blockId;
  }

  if (req.user.role === Role.SUPER_ADMIN) {
    if (req.query.stateId) where.stateId = String(req.query.stateId).trim();
    if (req.query.districtId) where.districtId = String(req.query.districtId).trim();
    if (req.query.blockId) where.blockId = String(req.query.blockId).trim();
  }

  if (req.query.cscStatus && Object.values(CSC_STATUS).includes(req.query.cscStatus)) {
    where.cscStatus = req.query.cscStatus;
  }

  const [total, agents] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      take: limit,
      skip,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        state: true,
        district: true,
        block: true,
        stateId: true,
        districtId: true,
        blockId: true,
        cscStatus: true,
        cscDocument: {
          select: {
            aadhaarUrl: true,
            licenseUrl: true,
            verificationCertificateUrl: true,
            bankPassbookUrl: true,
            cscIdOrVleCertificateUrl: true,
            characterCertificateUrl: true,
            submittedAt: true,
            reviewNote: true,
          },
        },
      },
    }),
  ]);

  return res.json({
    agents,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

router.patch('/csc-agents/:id/status', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const status = String(req.body.status || '').toUpperCase();
  const reviewNote = req.body.reviewNote ? String(req.body.reviewNote) : null;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid CSC agent id' });
  }

  if (![CSC_STATUS.APPROVED, CSC_STATUS.REJECTED].includes(status)) {
    return res.status(400).json({ error: 'status must be APPROVED or REJECTED' });
  }

  const agent = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      blockId: true,
      cscDocument: {
        select: {
          id: true,
          aadhaarUrl: true,
          licenseUrl: true,
          verificationCertificateUrl: true,
          bankPassbookUrl: true,
          cscIdOrVleCertificateUrl: true,
          characterCertificateUrl: true,
        },
      },
    },
  });

  if (!agent || agent.role !== Role.CSC_AGENT) {
    return res.status(404).json({ error: 'CSC agent not found' });
  }

  if (req.user.role === Role.BLOCK_ADMIN && agent.blockId !== req.user.blockId) {
    return res.status(403).json({ error: 'Cannot review agent outside your block' });
  }

  if (status === CSC_STATUS.APPROVED && !hasCompleteCscDocuments(agent.cscDocument)) {
    return res.status(400).json({ error: 'CSC documents must be submitted before approval' });
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    if (agent.cscDocument) {
      await tx.cscDocument.update({
        where: { userId: id },
        data: { reviewNote },
      });
    }

    return tx.user.update({
      where: { id },
      data: { cscStatus: status },
      select: {
        id: true,
        name: true,
        email: true,
        address: true,
        state: true,
        district: true,
        block: true,
        cscStatus: true,
      },
    });
  });

  return res.json({ user: updatedUser });
});

router.get('/users', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const where = {};
  if (req.user.role === Role.BLOCK_ADMIN) {
    where.blockId = req.user.blockId;
  }

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      take: limit,
      skip,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        role: true,
        cscStatus: true,
        state: true,
        district: true,
        block: true,
        stateId: true,
        districtId: true,
        blockId: true,
      },
    }),
  ]);

  return res.json({
    users,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

module.exports = router;
