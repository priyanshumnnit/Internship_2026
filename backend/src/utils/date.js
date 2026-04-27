function toDateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getDateRange(startDate, durationDays) {
  const start = toDateOnly(startDate);
  const days = Number(durationDays);
  if (!start || !Number.isInteger(days) || days < 1) {
    return [];
  }

  const dates = [];
  for (let index = 0; index < days; index += 1) {
    dates.push(addUtcDays(start, index));
  }
  return dates;
}

function toIsoDateString(value) {
  const date = toDateOnly(value);
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function isFutureDate(value) {
  const target = toDateOnly(value);
  if (!target) {
    return false;
  }
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return target.getTime() > today.getTime();
}

module.exports = {
  toDateOnly,
  addUtcDays,
  getDateRange,
  toIsoDateString,
  isFutureDate,
};
