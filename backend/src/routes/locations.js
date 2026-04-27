const express = require('express');
const multer = require('multer');
const { Role } = require('@prisma/client');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { syncLocationHierarchy, normalizeName } = require('../services/locationImport');
const prisma = require('../lib/prisma');
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 5,
  },
});

router.get('/states', async (req, res) => {
  const states = await prisma.state.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return res.json(states);
});

router.get('/districts', async (req, res) => {
  const stateId = String(req.query.stateId || '').trim();
  const searchText = String(req.query.search || '').trim();

  if (!stateId) {
    return res.status(400).json({ error: 'stateId is required' });
  }

  const districts = await prisma.district.findMany({
    where: {
      stateId,
      ...(searchText
        ? {
            name: {
              contains: searchText,
              mode: 'insensitive',
            },
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      stateId: true,
    },
    orderBy: { name: 'asc' },
    take: 10,
  });

  return res.json(districts);
});

router.get('/blocks', async (req, res) => {
  const districtId = String(req.query.districtId || '').trim();
  const searchText = String(req.query.search || '').trim();

  if (!districtId) {
    return res.status(400).json({ error: 'districtId is required' });
  }

  const blocks = await prisma.block.findMany({
    where: {
      districtId,
      ...(searchText
        ? {
            name: {
              contains: searchText,
              mode: 'insensitive',
            },
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      districtId: true,
    },
    orderBy: { name: 'asc' },
    take: 10,
  });

  return res.json(blocks);
});

router.get('/locations/summary', authenticate, authorizeRoles(Role.SUPER_ADMIN), async (_req, res) => {
  const [states, districts, blocks] = await Promise.all([
    prisma.state.count(),
    prisma.district.count(),
    prisma.block.count(),
  ]);

  return res.json({ states, districts, blocks });
});

router.post('/locations/states', authenticate, authorizeRoles(Role.SUPER_ADMIN), async (req, res) => {
  const name = normalizeName(req.body.name);
  if (!name) {
    return res.status(400).json({ error: 'State name is required' });
  }

  const existing = await prisma.state.findUnique({ where: { name }, select: { id: true } });
  if (existing) {
    return res.status(409).json({ error: 'State already exists' });
  }

  const state = await prisma.state.create({
    data: { name },
    select: { id: true, name: true },
  });

  return res.status(201).json({ state });
});

router.post('/locations/districts', authenticate, authorizeRoles(Role.SUPER_ADMIN), async (req, res) => {
  const stateId = String(req.body.stateId || '').trim();
  const name = normalizeName(req.body.name);

  if (!stateId || !name) {
    return res.status(400).json({ error: 'stateId and district name are required' });
  }

  const state = await prisma.state.findUnique({ where: { id: stateId }, select: { id: true } });
  if (!state) {
    return res.status(404).json({ error: 'State not found' });
  }

  const existing = await prisma.district.findUnique({
    where: {
      name_stateId: {
        name,
        stateId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return res.status(409).json({ error: 'District already exists in this state' });
  }

  const district = await prisma.district.create({
    data: { name, stateId },
    select: { id: true, name: true, stateId: true },
  });

  return res.status(201).json({ district });
});

router.post('/locations/blocks', authenticate, authorizeRoles(Role.SUPER_ADMIN), async (req, res) => {
  const districtId = String(req.body.districtId || '').trim();
  const name = normalizeName(req.body.name);

  if (!districtId || !name) {
    return res.status(400).json({ error: 'districtId and block name are required' });
  }

  const district = await prisma.district.findUnique({ where: { id: districtId }, select: { id: true } });
  if (!district) {
    return res.status(404).json({ error: 'District not found' });
  }

  const existing = await prisma.block.findUnique({
    where: {
      name_districtId: {
        name,
        districtId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return res.status(409).json({ error: 'Block already exists in this district' });
  }

  const block = await prisma.block.create({
    data: { name, districtId },
    select: { id: true, name: true, districtId: true },
  });

  return res.status(201).json({ block });
});

router.post('/locations/import-lgd', authenticate, authorizeRoles(Role.SUPER_ADMIN), upload.array('files', 5), async (req, res) => {
  const clearExisting = req.body.clearExisting === 'true' || req.body.clearExisting === true;

  const importInputs = [];

  for (const file of req.files || []) {
    importInputs.push({
      buffer: file.buffer,
      name: file.originalname,
    });
  }

  if (!importInputs.length && Array.isArray(req.body.filePaths)) {
    for (const filePath of req.body.filePaths) {
      importInputs.push({ path: String(filePath) });
    }
  }

  if (!importInputs.length && typeof req.body.filePath === 'string') {
    importInputs.push({ path: req.body.filePath });
  }

  if (!importInputs.length) {
    return res.status(400).json({ error: 'Provide at least one LGD excel file (upload or filePath)' });
  }

  try {
    const report = await syncLocationHierarchy(prisma, importInputs, { clearExisting });
    return res.json({ message: 'LGD import completed', report });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'LGD import failed' });
  }
});

module.exports = router;
