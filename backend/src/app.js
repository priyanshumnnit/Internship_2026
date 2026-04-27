const express = require('express');
const cors = require('cors');
const { patchExpressAsync } = require('./utils/patchExpressAsync');

patchExpressAsync(express);

const authRoutes = require('./routes/auth');
const workerRoutes = require('./routes/workers');
const customerRoutes = require('./routes/customers');
const orderRoutes = require('./routes/orders');
const attendanceRoutes = require('./routes/attendance');
const paymentRoutes = require('./routes/payments');
const refundRoutes = require('./routes/refunds');
const complaintRoutes = require('./routes/complaints');
const analyticsRoutes = require('./routes/analytics');
const manageRoutes = require('./routes/manage');
const uploadRoutes = require('./routes/uploads');
const locationRoutes = require('./routes/locations');
const prisma = require('./lib/prisma');

const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'blue-collar-backend' });
});

app.use('/api', locationRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/manage', manageRoutes);
app.use('/api/uploads', uploadRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, _req, res, _next) => {
  if (err?.statusCode === 503 || prisma.isTransientDatabaseError?.(err)) {
    const message = err?.message || 'Database connection is temporarily unavailable. Please retry in a few seconds.';
    // eslint-disable-next-line no-console
    console.warn(err);
    return res.status(503).json({
      error: message,
      code: err?.code || 'DATABASE_UNAVAILABLE',
    });
  }

  if (err?.code === 'P2022' || err?.code === 'P2021') {
    const detail = err?.meta?.column || err?.meta?.table
      ? `${err?.meta?.table ? `Missing table: ${err.meta.table}` : `Missing column: ${err.meta.column}`}.`
      : undefined;
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({
      error: 'Database schema is out of sync with the Prisma client. Run `npx prisma db push` and `npx prisma generate` in `backend`, then restart the server.',
      code: err.code,
      detail,
    });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
