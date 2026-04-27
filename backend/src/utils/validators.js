const { CSC_EMAIL_DOMAIN } = require('./constants');
const { isFutureDate } = require('./date');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\d{10}$/;

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') {
    return null;
  }
  return email.trim().toLowerCase();
}

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return null;
  }
  return phone.trim();
}

function validateEmail(email) {
  return typeof email === 'string' && emailPattern.test(email.trim());
}

function validatePhone(phone) {
  return typeof phone === 'string' && phonePattern.test(phone.trim());
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

function isCscEmail(email) {
  return validateEmail(email) && normalizeEmail(email).endsWith(CSC_EMAIL_DOMAIN);
}

function validateOrderInput({ category, workersCount, startDate, durationDays, serviceAddress }) {
  const errors = [];

  if (!category || typeof category !== 'string') {
    errors.push('category is required');
  }

  if (!serviceAddress || typeof serviceAddress !== 'string' || !serviceAddress.trim()) {
    errors.push('service_address is required');
  }

  if (!Number.isInteger(Number(workersCount)) || Number(workersCount) <= 0) {
    errors.push('workers_count must be greater than 0');
  }

  if (!Number.isInteger(Number(durationDays)) || Number(durationDays) < 1) {
    errors.push('duration_days must be at least 1');
  }

  if (!startDate || !isFutureDate(startDate)) {
    errors.push('start_date must be after current date');
  }

  return errors;
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function validateComplaintType(type) {
  return ['absent', 'poor_quality', 'quality', 'misconduct'].includes(type);
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return null;
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  validateEmail,
  validatePhone,
  validatePassword,
  isCscEmail,
  validateOrderInput,
  parsePositiveInt,
  validateComplaintType,
  parseBoolean,
};
