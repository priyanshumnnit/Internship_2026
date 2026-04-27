const dotenv = require('dotenv');
const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { syncNumericCounter } = require('../src/lib/numericIds');

dotenv.config();

const prisma = new PrismaClient({
  datasources: process.env.MONGO_DATABASE_URL
    ? {
        db: {
          url: process.env.MONGO_DATABASE_URL,
        },
      }
    : undefined,
});

const sqlClient = new Client({
  connectionString:
    process.env.LEGACY_SQL_DATABASE_URL
    || process.env.ALTERNATE_DATABASE_URL
    || process.env.DATABASE_URL,
});

const migrationPlan = [
  { table: 'State', model: 'state' },
  { table: 'District', model: 'district' },
  { table: 'Block', model: 'block' },
  {
    table: 'User',
    model: 'user',
    numericId: true,
    stripNullFields: ['email', 'phone'],
    dateFields: ['createdAt', 'updatedAt'],
  },
  {
    table: 'Otp',
    model: 'otp',
    numericId: true,
    dateFields: ['expiresAt', 'consumedAt', 'createdAt'],
  },
  {
    table: 'CscDocument',
    model: 'cscDocument',
    numericId: true,
    dateFields: ['submittedAt', 'updatedAt'],
  },
  { table: 'Customer', model: 'customer', numericId: true },
  {
    table: 'Worker',
    model: 'worker',
    numericId: true,
    dateFields: ['createdAt', 'updatedAt'],
  },
  {
    table: 'Order',
    model: 'order',
    numericId: true,
    stripNullFields: ['customerPaymentOrderId', 'customerPaymentId'],
    dateFields: ['startDate', 'customerPaidAt', 'createdAt', 'updatedAt'],
  },
  {
    table: 'OrderWorker',
    model: 'orderWorker',
    numericId: true,
    dateFields: ['assignedAt'],
  },
  {
    table: 'OrderWorkerDay',
    model: 'orderWorkerDay',
    numericId: true,
    dateFields: ['workDate', 'createdAt', 'updatedAt'],
  },
  {
    table: 'AttendanceRequest',
    model: 'attendanceRequest',
    numericId: true,
    dateFields: ['date', 'createdAt', 'respondedAt'],
  },
  {
    table: 'Attendance',
    model: 'attendance',
    numericId: true,
    dateFields: ['date', 'createdAt', 'updatedAt'],
  },
  {
    table: 'Payment',
    model: 'payment',
    numericId: true,
    stripNullFields: ['attendanceId'],
    dateFields: ['date', 'transactionDate', 'paidAt', 'lockedAt', 'createdAt', 'updatedAt'],
  },
  {
    table: 'PaymentTicket',
    model: 'paymentTicket',
    numericId: true,
    dateFields: ['createdAt', 'updatedAt'],
  },
  {
    table: 'PaymentAuditLog',
    model: 'paymentAuditLog',
    numericId: true,
    dateFields: ['createdAt'],
  },
  {
    table: 'OrderRefund',
    model: 'orderRefund',
    numericId: true,
    dateFields: ['refundedAt', 'createdAt', 'updatedAt'],
  },
  {
    table: 'Complaint',
    model: 'complaint',
    numericId: true,
    dateFields: ['createdAt', 'updatedAt'],
  },
];

function chunkArray(items, size = 500) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeDateValue(value) {
  if (!value) return value;
  return value instanceof Date ? value : new Date(value);
}

function normalizeRecord(record, spec) {
  const normalized = { ...record };

  for (const field of spec.stripNullFields || []) {
    if (normalized[field] === null) {
      delete normalized[field];
    }
  }

  for (const field of spec.dateFields || []) {
    if (normalized[field] != null) {
      normalized[field] = normalizeDateValue(normalized[field]);
    }
  }

  return normalized;
}

async function readSourceTable(table) {
  const query = `SELECT to_jsonb(t) AS data FROM (SELECT * FROM "${table}" ORDER BY 1 ASC) t`;
  const result = await sqlClient.query(query);
  return result.rows.map((row) => row.data);
}

async function createManyInChunks(delegate, rows) {
  let inserted = 0;
  for (const chunk of chunkArray(rows, 500)) {
    const result = await delegate.createMany({ data: chunk });
    inserted += result.count || 0;
  }
  return inserted;
}

async function clearTargetDatabase() {
  const deleteOrder = [
    prisma.orderRefund,
    prisma.paymentAuditLog,
    prisma.paymentTicket,
    prisma.payment,
    prisma.attendance,
    prisma.attendanceRequest,
    prisma.orderWorkerDay,
    prisma.orderWorker,
    prisma.complaint,
    prisma.order,
    prisma.worker,
    prisma.cscDocument,
    prisma.customer,
    prisma.otp,
    prisma.user,
    prisma.block,
    prisma.district,
    prisma.state,
    prisma.counter,
  ];

  for (const delegate of deleteOrder) {
    await delegate.deleteMany();
  }
}

async function ensureReadyTarget() {
  const existingCounts = await Promise.all([
    prisma.user.count(),
    prisma.customer.count(),
    prisma.worker.count(),
    prisma.order.count(),
    prisma.state.count(),
  ]);

  const hasExistingData = existingCounts.some((count) => count > 0);
  const forceClear = process.argv.includes('--force-clear');

  if (hasExistingData && !forceClear) {
    throw new Error(
      'Target MongoDB already contains data. Re-run `npm run migrate:sql-to-mongo -- --force-clear` to replace it.',
    );
  }

  if (hasExistingData) {
    await clearTargetDatabase();
  }
}

async function migrate() {
  if (!process.env.MONGO_DATABASE_URL) {
    throw new Error('MONGO_DATABASE_URL is required to migrate data into MongoDB.');
  }

  if (process.env.MONGO_DATABASE_URL.includes('<cluster-host>')) {
    throw new Error('Replace `<cluster-host>` in MONGO_DATABASE_URL before running the migration.');
  }

  await sqlClient.connect();
  await prisma.$connect();

  await ensureReadyTarget();
  await prisma.counter.deleteMany();

  for (const spec of migrationPlan) {
    const rawRows = await readSourceTable(spec.table);
    const rows = rawRows.map((row) => normalizeRecord(row, spec));

    if (!rows.length) {
      // eslint-disable-next-line no-console
      console.log(`${spec.table}: 0 rows`);
      if (spec.numericId) {
        await syncNumericCounter(prisma, spec.model, 0);
      }
      continue;
    }

    const inserted = await createManyInChunks(prisma[spec.model], rows);

    if (spec.numericId) {
      const maxId = rows.reduce((maximum, row) => Math.max(maximum, row.id || 0), 0);
      await syncNumericCounter(prisma, spec.model, maxId);
    }

    // eslint-disable-next-line no-console
    console.log(`${spec.table}: migrated ${inserted} row(s)`);
  }

  // eslint-disable-next-line no-console
  console.log('PostgreSQL to MongoDB migration completed successfully.');
}

migrate()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sqlClient.end().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });
