const nodemailer = require('nodemailer');

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function getSmtpConfig() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = parseBoolean(process.env.SECURE, port === 465);
  const user = process.env.SMTP_USER || process.env.SMTP_MAIL || '';
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '';

  const config = {
    host: process.env.SMTP_HOST || undefined,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  };

  if (process.env.SMTP_SERVICE) {
    config.service = process.env.SMTP_SERVICE;
  }

  return {
    config,
    user,
  };
}

async function sendOtpEmail(to, code) {
  const { config, user } = getSmtpConfig();

  if (!user || !config.auth) {
    console.warn('SMTP credentials missing. Skipping OTP email send.');
    return false;
  }

  const transporter = nodemailer.createTransport(config);

  const mail = {
    from: process.env.SMTP_FROM || user,
    to,
    subject: 'Blue Collar Portal OTP Verification',
    text: `Your verification code is ${code}. It is valid for 5 minutes.`,
  };

  try {
    await transporter.sendMail(mail);
    return true;
  } catch (error) {
    console.error('Email send failed', error);
    return false;
  }
}

module.exports = { sendOtpEmail };
