const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const TRANSIENT_PRISMA_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
]);

const TRANSIENT_MESSAGE_PARTS = [
  "can't reach database server",
  'server selection timeout',
  'replica set no primary',
  'topology was destroyed',
  'connection has been closed',
  'connection closed',
  'connection reset',
  'socket hang up',
  'connection pool closed',
];

class DatabaseUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'DatabaseUnavailableError';
    this.code = 'DATABASE_UNAVAILABLE';
    this.statusCode = 503;
    this.cause = cause;
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeDatasourceUrl(rawUrl) {
  if (!rawUrl) return undefined;
  return rawUrl;
}

function buildPrismaLogConfig() {
  if (process.env.NODE_ENV === 'development') {
    return [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ];
  }

  return [
    { emit: 'event', level: 'error' },
  ];
}

function collectErrorText(error) {
  if (!error) return '';

  const parts = [
    error.message,
    error.code,
    error.meta?.cause,
    error.cause?.message,
    error.cause?.code,
    error.cause?.meta?.cause,
  ].filter(Boolean);

  return parts.join(' | ').toLowerCase();
}

function isTransientDatabaseError(error) {
  if (!error) return false;

  const code = error.code || error.cause?.code;
  if (code && TRANSIENT_PRISMA_CODES.has(code)) {
    return true;
  }

  const text = collectErrorText(error);
  return TRANSIENT_MESSAGE_PARTS.some((part) => text.includes(part));
}

const runtimeDatasourceUrl = normalizeDatasourceUrl(
  process.env.MONGO_DATABASE_URL,
);

function createBasePrismaClient() {
  const client = new PrismaClient({
    datasources: runtimeDatasourceUrl
      ? {
          db: {
            url: runtimeDatasourceUrl,
          },
        }
      : undefined,
    log: buildPrismaLogConfig(),
  });

  client.$on('warn', (event) => {
    // eslint-disable-next-line no-console
    console.warn(`[prisma] ${event.message}`);
  });

  client.$on('error', (event) => {
    if (isTransientDatabaseError(event)) {
      // eslint-disable-next-line no-console
      console.warn(`[prisma] transient connection issue: ${event.message}`);
      return;
    }

    // eslint-disable-next-line no-console
    console.error(`[prisma] ${event.message}`);
  });

  return client;
}

const basePrisma = globalForPrisma.__shramSangamPrismaBase || createBasePrismaClient();
let reconnectPromise = null;

async function reconnectPrisma() {
  if (reconnectPromise) {
    return reconnectPromise;
  }

  reconnectPromise = (async () => {
    await basePrisma.$disconnect().catch(() => {});
    await basePrisma.$connect();
    await basePrisma.$runCommandRaw({ ping: 1 });
  })().finally(() => {
    reconnectPromise = null;
  });

  return reconnectPromise;
}

async function runWithRecovery({ label, retryable, execute }) {
  try {
    return await execute();
  } catch (error) {
    if (!isTransientDatabaseError(error)) {
      throw error;
    }

    // eslint-disable-next-line no-console
    console.warn(`[prisma] recovered transient disconnect during ${label}; reconnecting...`);

    try {
      await reconnectPrisma();
    } catch (reconnectError) {
      throw new DatabaseUnavailableError(
        'Database connection is temporarily unavailable. Please retry in a few seconds.',
        reconnectError,
      );
    }

    if (retryable) {
      try {
        return await execute();
      } catch (retryError) {
        if (!isTransientDatabaseError(retryError)) {
          throw retryError;
        }
      }
    }

    throw new DatabaseUnavailableError(
      'Database connection was interrupted while processing the request. Refresh to verify the latest state, then retry if needed.',
      error,
    );
  }
}

const prisma = globalForPrisma.__shramSangamPrisma || basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        return runWithRecovery({
          label: `${model}.${operation}`,
          retryable: READ_OPERATIONS.has(operation),
          execute: () => query(args),
        });
      },
    },
  },
});

async function connectWithRetry(options = {}) {
  const {
    attempts = 6,
    initialDelayMs = 1000,
  } = options;

  let attempt = 0;
  let delayMs = initialDelayMs;

  while (attempt < attempts) {
    attempt += 1;

    try {
      await reconnectPrisma();
      return;
    } catch (error) {
      if (attempt >= attempts) {
        throw error;
      }

      // eslint-disable-next-line no-console
      console.warn(`[prisma] startup connection attempt ${attempt} failed. Retrying in ${delayMs}ms...`);
      await wait(delayMs);
      delayMs = Math.min(delayMs * 2, 8000);
    }
  }
}

prisma.connectWithRetry = connectWithRetry;
prisma.isTransientDatabaseError = isTransientDatabaseError;
prisma.DatabaseUnavailableError = DatabaseUnavailableError;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__shramSangamPrisma = prisma;
  globalForPrisma.__shramSangamPrismaBase = basePrisma;
}

module.exports = prisma;
