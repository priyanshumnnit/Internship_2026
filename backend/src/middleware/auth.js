const { verifyAccessToken } = require('../utils/jwt');
const prisma = require('../lib/prisma');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        role: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        cscStatus: true,
        state: true,
        district: true,
        block: true,
        stateId: true,
        districtId: true,
        blockId: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function authorizeRoles(...acceptedRoles) {
  return (req, res, next) => {
    if (!req.user || !acceptedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (req.user.role === 'CSC_AGENT' && req.user.cscStatus !== 'APPROVED') {
      return res.status(403).json({
        error: 'Complete CSC document submission and wait for approval before using agent features.',
        code: 'CSC_APPROVAL_REQUIRED',
      });
    }

    return next();
  };
}

function requireApprovedCsc(req, res, next) {
  if (req.user.role !== 'CSC_AGENT') {
    return res.status(403).json({ error: 'Only CSC agents can perform this action' });
  }

  if (req.user.cscStatus !== 'APPROVED') {
    return res.status(403).json({ error: 'CSC agent is not approved for this action' });
  }

  return next();
}

module.exports = {
  authenticate,
  authorizeRoles,
  requireApprovedCsc,
};
