const express = require('express');
const bcrypt = require('bcryptjs');
const { OtpPurpose, Role } = require('@prisma/client');
const { sendOtpEmail } = require('../services/email');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../utils/jwt');
const {
  normalizeEmail,
  normalizePhone,
  validateEmail,
  validatePhone,
  validatePassword,
} = require('../utils/validators');
const {
  OTP_CODE,
  OTP_TTL_MINUTES,
  CSC_STATUS,
} = require('../utils/constants');
const { authenticate } = require('../middleware/auth');
const { resolveLocationByIds } = require('../services/location');
const prisma = require('../lib/prisma');
const {
  createWithNumericId,
  upsertWithNumericId,
} = require('../lib/numericIds');
const router = express.Router();

function buildTokenBundle(user) {
  const payload = {
    userId: user.id,
    role: user.role,
    blockId: user.blockId || null,
  };

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: {
      id: user.id,
      role: user.role,
      email: user.email,
      phone: user.phone,
      name: user.name,
      address: user.address,
      cscStatus: user.cscStatus,
      state: user.state,
      district: user.district,
      block: user.block,
      stateId: user.stateId,
      districtId: user.districtId,
      blockId: user.blockId,
    },
  };
}

function parseIdentifier(emailInput, phoneInput) {
  const email = normalizeEmail(emailInput);
  const phone = normalizePhone(phoneInput);

  if (email && phone) {
    return { error: 'Provide either email or phone, not both' };
  }

  if (!email && !phone) {
    return { error: 'Email or phone is required' };
  }

  if (email && !validateEmail(email)) {
    return { error: 'Invalid email format' };
  }

  if (phone && !validatePhone(phone)) {
    return { error: 'Invalid phone format' };
  }

  return {
    email: email || null,
    phone: phone || null,
    where: email ? { email } : { phone },
  };
}

function parseOtpPurpose(value) {
  const normalized = String(value || 'SIGNUP').trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(OtpPurpose, normalized)) {
    return null;
  }
  return normalized;
}

function generateRandomOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function resolveOtpCode({ email }) {
  return email ? generateRandomOtp() : OTP_CODE;
}

async function consumeOtp(record) {
  await prisma.otp.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });
}

function parseLocationIds(req) {
  return {
    stateId: String(req.body.stateId || '').trim(),
    districtId: String(req.body.districtId || '').trim(),
    blockId: String(req.body.blockId || '').trim(),
  };
}

function parseAddress(value) {
  const address = String(value || '').trim();
  return address || null;
}

function buildCscDocumentPayload(input = {}) {
  const aadhaarUrl = String(input.aadhaarUrl || '').trim();
  const licenseUrl = String(input.licenseUrl || input.bankPassbookUrl || '').trim();
  const verificationCertificateUrl = String(
    input.verificationCertificateUrl || input.cscIdOrVleCertificateUrl || input.characterCertificateUrl || '',
  ).trim();

  return {
    aadhaarUrl,
    licenseUrl: licenseUrl || null,
    verificationCertificateUrl: verificationCertificateUrl || null,
    bankPassbookUrl: input.bankPassbookUrl ? String(input.bankPassbookUrl).trim() : null,
    cscIdOrVleCertificateUrl: input.cscIdOrVleCertificateUrl ? String(input.cscIdOrVleCertificateUrl).trim() : null,
    characterCertificateUrl: input.characterCertificateUrl ? String(input.characterCertificateUrl).trim() : null,
  };
}

function hasRequiredCscDocumentPayload(documentPayload) {
  return Boolean(
    documentPayload.aadhaarUrl
    && documentPayload.licenseUrl
    && documentPayload.verificationCertificateUrl,
  );
}

router.post('/request-otp', async (req, res) => {
  const role = req.body.role || Role.CUSTOMER;
  const purpose = parseOtpPurpose(req.body.purpose);

  if (!purpose) {
    return res.status(400).json({ error: 'purpose must be SIGNUP or LOGIN' });
  }

  const parsed = parseIdentifier(req.body.email, req.body.phone);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const { email, phone, where } = parsed;

  if (role === Role.CSC_AGENT) {
    if (!email || phone) {
      return res.status(400).json({ error: 'CSC agent OTP requires only email' });
    }
  }

  if (purpose === OtpPurpose.SIGNUP) {
    if (![Role.CUSTOMER, Role.CSC_AGENT].includes(role)) {
      return res.status(400).json({ error: 'Signup OTP is available only for CUSTOMER and CSC_AGENT' });
    }

    const existing = await prisma.user.findFirst({ where });
    if (existing) {
      return res.status(409).json({ error: 'User already exists for this identifier' });
    }
  }

  let loginUser = null;
  if (purpose === OtpPurpose.LOGIN) {
    loginUser = await prisma.user.findFirst({ where });
    if (!loginUser) {
      return res.status(404).json({
        error: 'User not found. Redirect to signup.',
        redirectToSignup: true,
      });
    }
  }

  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  const code = resolveOtpCode({ email });
  const otpRecord = await createWithNumericId(prisma, 'otp', {
    data: {
      email,
      phone,
      code,
      purpose,
      expiresAt,
      userId: loginUser?.id || null,
    },
  });

  if (email) {
    const sent = await sendOtpEmail(email, code);
    if (!sent) {
      await prisma.otp.delete({ where: { id: otpRecord.id } }).catch(() => null);
      return res.status(503).json({
        error: 'Unable to send email OTP. Please verify SMTP configuration and try again.',
      });
    }
  }

  return res.json({
    message: 'OTP sent successfully',
    deliveryChannel: email ? 'email' : 'phone',
    mockOtp: phone ? OTP_CODE : null,
    validForMinutes: OTP_TTL_MINUTES,
  });
});

router.post('/signup', async (req, res) => {
  const role = req.body.role || Role.CUSTOMER;

  if (![Role.CUSTOMER, Role.CSC_AGENT].includes(role)) {
    return res.status(400).json({ error: 'Only CUSTOMER and CSC_AGENT can sign up' });
  }

  const parsed = parseIdentifier(req.body.email, req.body.phone);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const { email, phone, where } = parsed;
  const password = req.body.password;
  const code = String(req.body.code || '').trim();
  const address = parseAddress(req.body.address);

  if (!code) {
    return res.status(400).json({ error: 'OTP code is required' });
  }

  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  if (!address) {
    return res.status(400).json({ error: 'Full address is required' });
  }

  const locationIds = parseLocationIds(req);
  let location;

  try {
    location = await resolveLocationByIds(prisma, locationIds);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (role === Role.CUSTOMER) {
    if (!locationIds.stateId || !locationIds.districtId || !locationIds.blockId) {
      return res.status(400).json({ error: 'stateId, districtId and blockId are required for customer signup' });
    }
  }

  if (role === Role.CSC_AGENT) {
    if (!email || phone) {
      return res.status(400).json({ error: 'CSC signup requires only email' });
    }
  }

  const existingUser = await prisma.user.findFirst({ where });
  if (existingUser) {
    return res.status(409).json({ error: 'User already exists for this identifier' });
  }

  const otpRecord = await prisma.otp.findFirst({
    where: {
      ...where,
      code,
      purpose: OtpPurpose.SIGNUP,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otpRecord) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const createdUser = await prisma.$transaction(async (tx) => {
    const user = await createWithNumericId(tx, 'user', {
      data: {
        role,
        name: req.body.name?.trim() || null,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        password: hashedPassword,
        address,
        cscStatus: role === Role.CSC_AGENT ? CSC_STATUS.PENDING : null,
        state: location.state.name,
        district: location.district.name,
        block: location.block.name,
        stateId: location.state.id,
        districtId: location.district.id,
        blockId: location.block.id,
      },
    });

    if (role === Role.CUSTOMER) {
      await createWithNumericId(tx, 'customer', {
        data: {
          userId: user.id,
          state: location.state.name,
          district: location.district.name,
          block: location.block.name,
          stateId: location.state.id,
          districtId: location.district.id,
          blockId: location.block.id,
        },
      });
    }

    await tx.otp.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date(), userId: user.id },
    });

    return user;
  });

  return res.status(201).json({
    message: 'Signup completed successfully',
    userId: createdUser.id,
  });
});

router.post('/login', async (req, res) => {
  const parsed = parseIdentifier(req.body.email, req.body.phone);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const { where } = parsed;
  const password = req.body.password;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const user = await prisma.user.findFirst({ where });
  if (!user) {
    return res.status(404).json({
      error: 'User not found. Redirect to signup.',
      redirectToSignup: true,
    });
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return res.json(buildTokenBundle(user));
});

router.post('/login-otp', async (req, res) => {
  const parsed = parseIdentifier(req.body.email, req.body.phone);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const { where } = parsed;
  const code = String(req.body.code || '').trim();

  if (!code) {
    return res.status(400).json({ error: 'OTP code is required' });
  }

  const user = await prisma.user.findFirst({ where });
  if (!user) {
    return res.status(404).json({
      error: 'User not found. Redirect to signup.',
      redirectToSignup: true,
    });
  }

  const otpRecord = await prisma.otp.findFirst({
    where: {
      ...where,
      code,
      purpose: OtpPurpose.LOGIN,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otpRecord) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  await consumeOtp(otpRecord);

  return res.json(buildTokenBundle(user));
});

router.post('/refresh', async (req, res) => {
  const refreshToken = String(req.body.refreshToken || '');

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    return res.json(buildTokenBundle(user));
  } catch (error) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      name: true,
      address: true,
      cscStatus: true,
      state: true,
      district: true,
      block: true,
      stateId: true,
      districtId: true,
      blockId: true,
      cscDocument: {
        select: {
          aadhaarUrl: true,
          licenseUrl: true,
          verificationCertificateUrl: true,
          bankPassbookUrl: true,
          cscIdOrVleCertificateUrl: true,
          characterCertificateUrl: true,
          submittedAt: true,
          reviewNote: true,
        },
      },
    },
  });

  return res.json({ user });
});

router.patch('/profile', authenticate, async (req, res) => {
  const name = req.body.name == null ? undefined : String(req.body.name).trim() || null;
  const address = req.body.address == null ? undefined : parseAddress(req.body.address);

  if (name === undefined && address === undefined) {
    return res.status(400).json({ error: 'Provide at least one profile field to update' });
  }

  if (address !== undefined && !address) {
    return res.status(400).json({ error: 'Address cannot be empty' });
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(address !== undefined ? { address } : {}),
    },
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      name: true,
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

  return res.json({ user, message: 'Profile updated successfully' });
});

router.post('/csc-documents', authenticate, async (req, res) => {
  if (req.user.role !== Role.CSC_AGENT) {
    return res.status(403).json({ error: 'Only CSC_AGENT can submit documents' });
  }

  const documentPayload = buildCscDocumentPayload(req.body);

  if (!hasRequiredCscDocumentPayload(documentPayload)) {
    return res.status(400).json({
      error: 'aadhaarUrl, licenseUrl and verificationCertificateUrl are required',
    });
  }

  await prisma.$transaction(async (tx) => {
    await upsertWithNumericId(tx, 'cscDocument', {
      where: { userId: req.user.id },
      create: {
        userId: req.user.id,
        ...documentPayload,
      },
      update: {
        ...documentPayload,
        submittedAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: req.user.id },
      data: { cscStatus: CSC_STATUS.PENDING },
    });
  });

  return res.json({ message: 'Documents submitted. Status is now PENDING for admin review.' });
});

module.exports = router;
