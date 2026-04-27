const NUMERIC_ID_MODELS = new Set([
  'user',
  'cscDocument',
  'customer',
  'worker',
  'order',
  'orderWorker',
  'attendance',
  'payment',
  'orderWorkerDay',
  'attendanceRequest',
  'paymentTicket',
  'paymentAuditLog',
  'orderRefund',
  'complaint',
  'otp',
]);

function normalizeManyInput(data) {
  return Array.isArray(data) ? data : [data];
}

function cloneWithoutUndefinedEntries(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}

async function nextNumericIds(db, model, count) {
  if (!NUMERIC_ID_MODELS.has(model) || count <= 0) {
    return [];
  }

  const counter = await db.counter.upsert({
    where: { id: model },
    create: {
      id: model,
      value: count,
    },
    update: {
      value: { increment: count },
    },
    select: {
      value: true,
    },
  });

  const start = counter.value - count + 1;
  return Array.from({ length: count }, (_unused, index) => start + index);
}

async function nextNumericId(db, model) {
  const ids = await nextNumericIds(db, model, 1);
  return ids[0];
}

async function addNumericId(db, model, data) {
  if (!NUMERIC_ID_MODELS.has(model)) {
    return cloneWithoutUndefinedEntries(data);
  }

  const normalized = cloneWithoutUndefinedEntries(data);
  if (normalized.id != null) {
    return normalized;
  }

  return {
    ...normalized,
    id: await nextNumericId(db, model),
  };
}

async function addNumericIds(db, model, data) {
  if (!NUMERIC_ID_MODELS.has(model)) {
    return normalizeManyInput(data).map((row) => cloneWithoutUndefinedEntries(row));
  }

  const rows = normalizeManyInput(data).map((row) => cloneWithoutUndefinedEntries(row));
  const missingRows = rows.filter((row) => row.id == null);
  const allocatedIds = await nextNumericIds(db, model, missingRows.length);
  let allocatedIndex = 0;

  return rows.map((row) => {
    if (row.id != null) {
      return row;
    }

    const id = allocatedIds[allocatedIndex];
    allocatedIndex += 1;
    return {
      ...row,
      id,
    };
  });
}

async function createWithNumericId(db, model, args) {
  return db[model].create({
    ...args,
    data: await addNumericId(db, model, args.data),
  });
}

async function createManyWithNumericIds(db, model, args) {
  const nextArgs = {
    ...args,
    data: await addNumericIds(db, model, args.data),
  };

  delete nextArgs.skipDuplicates;
  return db[model].createMany(nextArgs);
}

async function upsertWithNumericId(db, model, args) {
  return db[model].upsert({
    ...args,
    create: await addNumericId(db, model, args.create),
  });
}

async function syncNumericCounter(db, model, value) {
  if (!NUMERIC_ID_MODELS.has(model)) {
    return null;
  }

  return db.counter.upsert({
    where: { id: model },
    create: {
      id: model,
      value,
    },
    update: {
      value,
    },
  });
}

module.exports = {
  NUMERIC_ID_MODELS,
  nextNumericId,
  nextNumericIds,
  addNumericId,
  addNumericIds,
  createWithNumericId,
  createManyWithNumericIds,
  upsertWithNumericId,
  syncNumericCounter,
};
