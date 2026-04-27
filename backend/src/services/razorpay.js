const crypto = require('crypto');
const Razorpay = require('razorpay');

function hasRazorpayConfig() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getRazorpayClient() {
  if (!hasRazorpayConfig()) {
    return null;
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

async function createRazorpayOrder({ amountInPaise, receipt, notes = {} }) {
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
  }

  return razorpay.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt,
    notes,
    payment_capture: 1,
  });
}

function verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  if (!hasRazorpayConfig()) {
    return false;
  }

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  return expected === razorpaySignature;
}

module.exports = {
  hasRazorpayConfig,
  createRazorpayOrder,
  verifyRazorpaySignature,
};
