const XLSX = require('xlsx');

function normalizeName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function nameKey(value) {
  return normalizeName(value).toLowerCase();
}

function parseHierarchy(value) {
  const text = String(value || '').trim();
  const parts = text.split('/').map((item) => item.trim()).filter(Boolean);

  let districtName = '';
  let stateName = '';

  for (const part of parts) {
    if (part.toLowerCase().includes('(district)')) {
      districtName = normalizeName(part.replace(/\(district\)/ig, ''));
    }
    if (part.toLowerCase().includes('(state)')) {
      stateName = normalizeName(part.replace(/\(state\)/ig, ''));
    }
  }

  return { districtName, stateName };
}

function isDistrictSheetHeaders(headers) {
  return headers.includes('District Name (In English)')
    || headers.includes('District LGD Code');
}

function isBlockSheetHeaders(headers) {
  return headers.includes('Development Block Name (In English)')
    || headers.includes('Development Block LGD Code');
}

function readWorkbook(input) {
  if (input.buffer) {
    return XLSX.read(input.buffer, { type: 'buffer', raw: false });
  }
  return XLSX.readFile(input.path, { raw: false });
}

function parseWorkbook(input) {
  const workbook = readWorkbook(input);
  const parsed = {
    states: [],
    districts: [],
    blocks: [],
  };

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) {
      continue;
    }

    const headers = Object.keys(rows[0]);

    if (isDistrictSheetHeaders(headers)) {
      for (const row of rows) {
        const districtName = normalizeName(row['District Name (In English)'] || row['District Name'] || '');
        const hierarchy = parseHierarchy(row.Hierarchy);
        const stateName = normalizeName(hierarchy.stateName || row.State || '');

        if (!districtName || !stateName) {
          continue;
        }

        parsed.states.push({ name: stateName });
        parsed.districts.push({
          name: districtName,
          stateName,
        });
      }
      continue;
    }

    if (isBlockSheetHeaders(headers)) {
      for (const row of rows) {
        const blockName = normalizeName(row['Development Block Name (In English)'] || row['Block Name'] || '');
        const hierarchy = parseHierarchy(row.Hierarchy);
        const districtName = normalizeName(hierarchy.districtName || '');
        const stateName = normalizeName(hierarchy.stateName || '');

        if (!blockName || !districtName || !stateName) {
          continue;
        }

        parsed.states.push({ name: stateName });
        parsed.districts.push({
          name: districtName,
          stateName,
        });
        parsed.blocks.push({
          name: blockName,
          districtName,
          stateName,
        });
      }
    }
  }

  return parsed;
}

function dedupeStates(states) {
  const map = new Map();
  for (const state of states) {
    if (!state.name) continue;
    map.set(nameKey(state.name), { name: state.name });
  }
  return Array.from(map.values());
}

function dedupeDistricts(districts) {
  const map = new Map();
  for (const district of districts) {
    if (!district.name || !district.stateName) continue;
    map.set(`${nameKey(district.stateName)}::${nameKey(district.name)}`, {
      name: district.name,
      stateName: district.stateName,
    });
  }
  return Array.from(map.values());
}

function dedupeBlocks(blocks) {
  const map = new Map();
  for (const block of blocks) {
    if (!block.name || !block.districtName || !block.stateName) continue;
    map.set(`${nameKey(block.stateName)}::${nameKey(block.districtName)}::${nameKey(block.name)}`, {
      name: block.name,
      districtName: block.districtName,
      stateName: block.stateName,
    });
  }
  return Array.from(map.values());
}

function chunkArray(items, size = 500) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function createManyInChunks(delegate, data) {
  if (!data.length) {
    return 0;
  }

  let inserted = 0;
  for (const chunk of chunkArray(data, 500)) {
    const result = await delegate.createMany({
      data: chunk,
    });
    inserted += result.count || 0;
  }
  return inserted;
}

async function syncLocationHierarchy(prisma, importInputList, options = {}) {
  const clearExisting = options.clearExisting === true;
  const inputList = Array.isArray(importInputList) ? importInputList : [];

  if (!inputList.length) {
    throw new Error('At least one LGD file input is required');
  }

  let statesRaw = [];
  let districtsRaw = [];
  let blocksRaw = [];

  for (const input of inputList) {
    const parsed = parseWorkbook(input);
    statesRaw = statesRaw.concat(parsed.states);
    districtsRaw = districtsRaw.concat(parsed.districts);
    blocksRaw = blocksRaw.concat(parsed.blocks);
  }

  const states = dedupeStates(statesRaw);
  const districts = dedupeDistricts(districtsRaw);
  const blocks = dedupeBlocks(blocksRaw);

  if (!states.length || !districts.length || !blocks.length) {
    throw new Error('Could not parse sufficient state/district/block rows from provided files');
  }

  if (clearExisting) {
    const [usersCount, customersCount, workersCount, ordersCount] = await Promise.all([
      prisma.user.count(),
      prisma.customer.count(),
      prisma.worker.count(),
      prisma.order.count(),
    ]);

    if (usersCount || customersCount || workersCount || ordersCount) {
      throw new Error('Cannot clear location master while user/customer/worker/order data exists. Clear business data first.');
    }

    await prisma.block.deleteMany();
    await prisma.district.deleteMany();
    await prisma.state.deleteMany();
  }

  const existingStates = [];
  for (const namesChunk of chunkArray(states.map((state) => state.name), 500)) {
    const stateChunk = await prisma.state.findMany({
      where: {
        name: {
          in: namesChunk,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });
    existingStates.push(...stateChunk);
  }

  const existingStateNameKeys = new Set(existingStates.map((state) => nameKey(state.name)));
  const createdStates = await createManyInChunks(
    prisma.state,
    states
      .filter((state) => !existingStateNameKeys.has(nameKey(state.name)))
      .map((state) => ({ name: state.name })),
  );

  const stateNameSet = new Set(states.map((state) => state.name));
  const persistedStates = [];
  for (const namesChunk of chunkArray(Array.from(stateNameSet), 500)) {
    const stateChunk = await prisma.state.findMany({
      where: {
        name: {
          in: namesChunk,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });
    persistedStates.push(...stateChunk);
  }

  const stateIdByNameKey = new Map(
    persistedStates.map((state) => [nameKey(state.name), state.id]),
  );

  const districtRows = [];
  for (const district of districts) {
    const stateId = stateIdByNameKey.get(nameKey(district.stateName));
    if (!stateId) {
      continue;
    }
    districtRows.push({
      name: district.name,
      stateId,
    });
  }

  const existingDistricts = [];
  for (const stateIdChunk of chunkArray(Array.from(new Set(districtRows.map((district) => district.stateId))), 200)) {
    const districtChunk = await prisma.district.findMany({
      where: {
        stateId: {
          in: stateIdChunk,
        },
      },
      select: {
        id: true,
        name: true,
        stateId: true,
      },
    });
    existingDistricts.push(...districtChunk);
  }

  const existingDistrictKeys = new Set(
    existingDistricts.map((district) => `${district.stateId}::${nameKey(district.name)}`),
  );
  const createdDistricts = await createManyInChunks(
    prisma.district,
    districtRows.filter((district) => !existingDistrictKeys.has(`${district.stateId}::${nameKey(district.name)}`)),
  );

  const stateIds = Array.from(new Set(districtRows.map((district) => district.stateId)));
  const persistedDistricts = [];
  for (const stateIdChunk of chunkArray(stateIds, 200)) {
    const districtChunk = await prisma.district.findMany({
      where: {
        stateId: {
          in: stateIdChunk,
        },
      },
      select: {
        id: true,
        name: true,
        stateId: true,
      },
    });
    persistedDistricts.push(...districtChunk);
  }

  const districtIdByKey = new Map(
    persistedDistricts.map((district) => [`${district.stateId}::${nameKey(district.name)}`, district.id]),
  );

  const blockRows = [];
  for (const block of blocks) {
    const stateId = stateIdByNameKey.get(nameKey(block.stateName));
    if (!stateId) {
      continue;
    }

    const districtId = districtIdByKey.get(`${stateId}::${nameKey(block.districtName)}`);
    if (!districtId) {
      continue;
    }

    blockRows.push({
      name: block.name,
      districtId,
    });
  }

  const existingBlocks = [];
  for (const districtIdChunk of chunkArray(Array.from(new Set(blockRows.map((block) => block.districtId))), 200)) {
    const blockChunk = await prisma.block.findMany({
      where: {
        districtId: {
          in: districtIdChunk,
        },
      },
      select: {
        id: true,
        name: true,
        districtId: true,
      },
    });
    existingBlocks.push(...blockChunk);
  }

  const existingBlockKeys = new Set(
    existingBlocks.map((block) => `${block.districtId}::${nameKey(block.name)}`),
  );
  const createdBlocks = await createManyInChunks(
    prisma.block,
    blockRows.filter((block) => !existingBlockKeys.has(`${block.districtId}::${nameKey(block.name)}`)),
  );

  const [totalStates, totalDistricts, totalBlocks] = await Promise.all([
    prisma.state.count(),
    prisma.district.count(),
    prisma.block.count(),
  ]);

  return {
    imported: {
      states: states.length,
      districts: districts.length,
      blocks: blocks.length,
    },
    created: {
      states: createdStates,
      districts: createdDistricts,
      blocks: createdBlocks,
    },
    totals: {
      states: totalStates,
      districts: totalDistricts,
      blocks: totalBlocks,
    },
  };
}

module.exports = {
  normalizeName,
  nameKey,
  parseHierarchy,
  parseWorkbook,
  syncLocationHierarchy,
};
