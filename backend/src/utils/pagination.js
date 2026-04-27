function getPagination(query) {
  const page = Math.max(Number.parseInt(query.page || '1', 10) || 1, 1);
  const limit = 20;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

module.exports = { getPagination };