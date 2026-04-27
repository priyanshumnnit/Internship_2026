const express = require('express');
const { Role } = require('@prisma/client');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  CUSTOMER_PAYMENT_STATUS,
  PAYMENT_STATUS,
  REFUND_STATUS,
} = require('../utils/constants');
const prisma = require('../lib/prisma');

const router = express.Router();

router.get('/', authenticate, authorizeRoles(Role.SUPER_ADMIN, Role.BLOCK_ADMIN), async (req, res) => {
  const blockFilter = req.user.role === Role.BLOCK_ADMIN
    ? { blockId: req.user.blockId }
    : {};

  const [
    totalWorkers,
    totalOrders,
    totalPayments,
    grossReceipts,
    paidCustomerOrders,
    paidWorkerPayouts,
    paidWorkerPayoutCount,
    pendingWorkerPayouts,
    pendingPayments,
    failedWorkerPayouts,
    failedPayments,
    processedRefunds,
    totalRefunds,
  ] = await Promise.all([
    prisma.worker.count({ where: blockFilter }),
    prisma.order.count({ where: blockFilter }),
    prisma.payment.count({ where: { order: blockFilter } }),
    prisma.order.aggregate({
      where: {
        ...blockFilter,
        customerPaymentStatus: CUSTOMER_PAYMENT_STATUS.PAID,
      },
      _sum: { total: true },
    }),
    prisma.order.count({
      where: {
        ...blockFilter,
        customerPaymentStatus: CUSTOMER_PAYMENT_STATUS.PAID,
      },
    }),
    prisma.payment.aggregate({
      where: {
        order: blockFilter,
        status: PAYMENT_STATUS.PAID,
      },
      _sum: { amount: true },
    }),
    prisma.payment.count({
      where: {
        order: blockFilter,
        status: PAYMENT_STATUS.PAID,
      },
    }),
    prisma.payment.aggregate({
      where: {
        order: blockFilter,
        status: PAYMENT_STATUS.PENDING,
      },
      _sum: { amount: true },
    }),
    prisma.payment.count({
      where: {
        order: blockFilter,
        status: PAYMENT_STATUS.PENDING,
      },
    }),
    prisma.payment.aggregate({
      where: {
        order: blockFilter,
        status: PAYMENT_STATUS.FAILED,
      },
      _sum: { amount: true },
    }),
    prisma.payment.count({
      where: {
        order: blockFilter,
        status: PAYMENT_STATUS.FAILED,
      },
    }),
    prisma.orderRefund.aggregate({
      where: {
        order: blockFilter,
        status: REFUND_STATUS.PROCESSED,
      },
      _sum: { amount: true },
    }),
    prisma.orderRefund.count({
      where: {
        order: blockFilter,
      },
    }),
  ]);

  const grossCustomerReceipts = grossReceipts._sum.total || 0;
  const totalPaidToWorkers = paidWorkerPayouts._sum.amount || 0;
  const pendingWorkerPayoutAmount = pendingWorkerPayouts._sum.amount || 0;
  const failedWorkerPayoutAmount = failedWorkerPayouts._sum.amount || 0;
  const totalRefundAmount = processedRefunds._sum.amount || 0;
  const netCustomerReceipts = grossCustomerReceipts - totalRefundAmount;
  const netProfit = netCustomerReceipts - totalPaidToWorkers;

  return res.json({
    totalWorkers,
    totalOrders,
    totalPayments,
    totalRevenue: netCustomerReceipts,
    pendingPayments,
    failedPayments,
    paidCustomerOrders,
    grossCustomerReceipts,
    netCustomerReceipts,
    totalPaidToWorkers,
    paidWorkerPayoutCount,
    pendingWorkerPayoutAmount,
    failedWorkerPayoutAmount,
    totalRefundAmount,
    totalRefunds,
    netProfit,
  });
});

module.exports = router;
