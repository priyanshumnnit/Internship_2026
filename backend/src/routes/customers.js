const express = require('express');
const { Role } = require('@prisma/client');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { getPagination } = require('../utils/pagination');
const prisma = require('../lib/prisma');
const router = express.Router();

router.get('/', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const where = {};
  if (req.user.role === Role.BLOCK_ADMIN) {
    where.blockId = req.user.blockId;
  }

  const [total, customers] = await prisma.$transaction([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      take: limit,
      skip,
      orderBy: { id: 'desc' },
      select: {
        id: true,
        state: true,
        district: true,
        block: true,
        stateId: true,
        districtId: true,
        blockId: true,
        user: {
          select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
        },
      },
      },
    }),
  ]);

  return res.json({
    customers,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

router.get('/me', authenticate, authorizeRoles(Role.CUSTOMER), async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { userId: req.user.id },
    select: {
      id: true,
      state: true,
      district: true,
      block: true,
      stateId: true,
      districtId: true,
      blockId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          role: true,
        },
      },
    },
  });

  if (!customer) {
    return res.status(404).json({ error: 'Customer profile not found' });
  }

  return res.json({ customer });
});

module.exports = router;
