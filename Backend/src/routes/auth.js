import { Router } from 'express';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import { UserModel } from '../models/User.js';
import { UserActivityModel } from '../models/UserActivity.js';
import { LicenseAuditModel } from '../models/LicenseAudit.js';
import { SubscriptionPlanModel } from '../models/SubscriptionPlan.js';
import { EMPTY_USER_WORKSPACE_DATA, WorkspaceModel } from '../models/Workspace.js';
import { createAccessToken, hashPassword, verifyPassword } from '../security.js';
import { requireUserManagement, requireUserOrEmployeeManagement } from '../middleware/authenticate.js';
import { hasPermission } from '../permissions.js';
import { getLicenseLimits, TRIAL_DURATION_DAYS } from '../licenseLimits.js';
import {
  getSmtpConfig,
  sendEmailVerificationCode,
  sendPasswordResetCode,
} from '../services/email.js';

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_CODE_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_CODE_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_RATE_LIMIT_MAX = 5;
const EMAIL_VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_VERIFICATION_CODE_MAX_ATTEMPTS = 5;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const EMPLOYEE_DETAIL_TEXT_LIMITS = {
  firstName: 120,
  middleName: 120,
  lastName: 120,
  serialNumber: 100,
  nationality: 100,
  nationalId: 100,
  passportNumber: 100,
  jobTitle: 120,
  department: 120,
  employmentType: 80,
  employmentStartDate: 10,
  employmentStatus: 20,
  bankName: 120,
  bankAccountNumber: 100,
  medicalNotes: 1000,
  emergencyContactName: 120,
  emergencyContactRelationship: 80,
  emergencyContactPhone: 40,
  emergencyContactAddress: 500,
  evcPlusPhone: 40,
  zaadPhone: 40,
  sahalPhone: 40,
};

function validateEmployeeDetails(value) {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Employee details must be an object.';
  }
  for (const [field, maxLength] of Object.entries(EMPLOYEE_DETAIL_TEXT_LIMITS)) {
    if (value[field] !== undefined && (typeof value[field] !== 'string' || value[field].length > maxLength)) {
      return `${field} must be text no longer than ${maxLength} characters.`;
    }
  }
  if (value.gender !== undefined && !['female', 'male'].includes(value.gender)) {
    return 'Gender must be female or male.';
  }
  if (value.residenceType !== undefined && !['local', 'foreigner'].includes(value.residenceType)) {
    return 'Residence type is invalid.';
  }
  if (value.employmentStatus !== undefined && !['active', 'on_leave', 'terminated'].includes(value.employmentStatus)) {
    return 'Employment status is invalid.';
  }
  if (value.payrollInvited !== undefined && typeof value.payrollInvited !== 'boolean') {
    return 'Payroll invitation status must be true or false.';
  }
  if (
    value.photo !== undefined &&
    (typeof value.photo !== 'string' ||
      value.photo.length > 3 * 1024 * 1024 ||
      (value.photo !== '' && !/^data:image\/(?:png|jpeg|webp);base64,/.test(value.photo)))
  ) {
    return 'Employee picture must be a PNG, JPEG, or WebP image no larger than 2 MB.';
  }
  if (!isValidCalendarDate(value.employmentStartDate)) {
    return 'Employment start date must be a valid date.';
  }
  return null;
}

function isValidDateOfBirth(value) {
  if (value === undefined || value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value < new Date().toISOString().slice(0, 10);
}

function isValidCalendarDate(value) {
  if (value === undefined || value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateRequiredEmployeeFields({ name, monthlySalary, dateOfBirth, address, employeeDetails = {} }) {
  if (!isValidDateOfBirth(dateOfBirth) || !dateOfBirth) {
    return 'Enter a valid employee date of birth before today.';
  }
  if (![employeeDetails.evcPlusPhone, employeeDetails.zaadPhone, employeeDetails.sahalPhone]
    .some((value) => typeof value === 'string' && value.trim())) {
    return 'Enter at least one registered EVC Plus, Zaad, or Sahal number for salary payments.';
  }
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    !Number.isFinite(monthlySalary) ||
    monthlySalary <= 0 ||
    typeof address !== 'string' ||
    !address.trim() ||
    !['female', 'male'].includes(employeeDetails.gender)
  ) {
    return 'Employee not created. Complete all required details, including full name, phone, email, date of birth, gender, address, security role, and salary greater than zero.';
  }
  return null;
}

function createTemporaryPassword() {
  return randomBytes(18).toString('base64url');
}

function consumeRateLimit(limits, key, max, windowMs, now = Date.now()) {
  const current = limits.get(key);
  if (current && now - current.startedAt < windowMs) {
    if (current.count >= max) return false;
    current.count += 1;
  } else {
    limits.set(key, { startedAt: now, count: 1 });
  }
  if (limits.size > 10000) {
    for (const [entryKey, limit] of limits) {
      if (now - limit.startedAt >= windowMs) limits.delete(entryKey);
    }
    while (limits.size > 10000) limits.delete(limits.keys().next().value);
  }
  return true;
}

function createEmailCodeHash(secret, purpose, email, code) {
  return createHmac('sha256', secret).update(`${purpose}:${email}:${code}`).digest('hex');
}

function getTenantId(user) {
  return user.tenantId || 'business';
}

function getTenantUserFilter(tenantId) {
  return tenantId === 'business'
    ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
    : { tenantId };
}

function createTrialLicense() {
  const activatedAt = new Date();
  const expiresAt = new Date(activatedAt.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const format = (value) => value.toISOString().replace('T', ' ').slice(0, 19);
  return {
    isActive: true,
    isLocked: false,
    lockedReason: '',
    licenseKey: 'MQ-TRIAL-365D',
    planId: 'plan-trial',
    planName: '365-Day Free Trial',
    activationDate: format(activatedAt),
    expiryDate: format(expiresAt),
    totalDays: TRIAL_DURATION_DAYS,
    currentDay: 1,
    daysRemaining: TRIAL_DURATION_DAYS,
    hoursRemaining: TRIAL_DURATION_DAYS * 24,
    secondsRemaining: TRIAL_DURATION_DAYS * 24 * 60 * 60,
    serverTimestamp: activatedAt.toISOString(),
    status: 'ACTIVE',
    ussdPhone: '683723015',
    activeUssdCode: '',
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth || '',
    address: user.address || '',
    jobTitle: user.jobTitle || '',
    monthlySalary: user.monthlySalary || 0,
    employeeDetails: user.employeeDetails || {},
    role: user.role,
    active: user.active,
    isEmailVerified: user.isEmailVerified !== false,
    createdAt: user.createdAt.toISOString().slice(0, 10),
  };
}

export async function ensureBootstrapAdmin() {
  const adminExists = await UserModel.exists({ role: 'admin' });
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  if (!adminExists && (!email || !password || !name)) {
    throw new Error(
      'Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, and BOOTSTRAP_ADMIN_PASSWORD before first startup.'
    );
  }
  if (!adminExists && password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`BOOTSTRAP_ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  if (!adminExists) {
    await UserModel.create({
      name,
      email,
      role: 'admin',
      tenantId: 'business',
      phone: '',
      active: true,
      passwordHash: await hashPassword(password),
    });
  }

  const platformCredentials = [
    process.env.PLATFORM_ADMIN_EMAIL,
    process.env.PLATFORM_ADMIN_NAME,
    process.env.PLATFORM_ADMIN_PASSWORD,
  ];
  const platformConfigProvided = platformCredentials.some((value) => value !== undefined);
  if (!platformConfigProvided) return;
  if (platformCredentials.some((value) => !value?.trim())) {
    throw new Error('Set PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_NAME, and PLATFORM_ADMIN_PASSWORD together.');
  }

  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL.trim().toLowerCase();
  const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD;
  const platformName = process.env.PLATFORM_ADMIN_NAME.trim();
  if (platformPassword.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`PLATFORM_ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  const existingPlatformAccount = await UserModel.findOne({ email: platformEmail }).select('+passwordHash');
  if (existingPlatformAccount) {
    if (existingPlatformAccount.role !== 'super_admin') {
      throw new Error('PLATFORM_ADMIN_EMAIL is already assigned to a non-platform account.');
    }
    return;
  }

  await UserModel.create({
    name: platformName,
    email: platformEmail,
    role: 'super_admin',
    tenantId: 'platform',
    phone: '',
    active: true,
    passwordHash: await hashPassword(platformPassword),
  });
}

export function createAuthRouter(secret, authenticate) {
  const router = Router();
  const passwordResetRequests = new Map();
  const passwordResetAttempts = new Map();
  const registrationRequests = new Map();
  const verificationSendRequests = new Map();
  const verificationAttemptRequests = new Map();

  const issueEmailVerificationCode = async (user, smtpConfig) => {
    const now = Date.now();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = createEmailCodeHash(secret, 'email-verification', user.email, code);
    user.emailVerificationCodeHash = codeHash;
    user.emailVerificationCodeExpiresAt = new Date(now + EMAIL_VERIFICATION_CODE_TTL_MS);
    user.emailVerificationCodeAttempts = 0;
    user.emailVerificationCodeSentAt = new Date(now);
    await user.save();
    try {
      await sendEmailVerificationCode(smtpConfig, user, code);
    } catch (error) {
      await UserModel.updateOne(
        { _id: user._id, emailVerificationCodeHash: codeHash },
        {
          $unset: {
            emailVerificationCodeHash: 1,
            emailVerificationCodeExpiresAt: 1,
            emailVerificationCodeAttempts: 1,
            emailVerificationCodeSentAt: 1,
          },
        }
      );
      throw error;
    }
    return new Date(now + EMAIL_VERIFICATION_CODE_TTL_MS);
  };

  const sendVerificationCodeHandler = async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
      }
      const smtpConfig = getSmtpConfig();
      if (!smtpConfig) {
        return res.status(503).json({ error: 'Email verification is not configured on the server.' });
      }
      const now = Date.now();
      const ipKey = `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
      const emailKey = `email:${email}`;
      if (
        !consumeRateLimit(verificationSendRequests, ipKey, 10, PASSWORD_RESET_RATE_LIMIT_WINDOW_MS, now) ||
        !consumeRateLimit(verificationSendRequests, emailKey, 5, PASSWORD_RESET_RATE_LIMIT_WINDOW_MS, now)
      ) {
        return res.status(429).json({ error: 'Too many verification code requests. Please try again later.' });
      }

      const user = await UserModel.findOne({ email, active: true })
        .select('+emailVerificationCodeHash +emailVerificationCodeExpiresAt +emailVerificationCodeAttempts +emailVerificationCodeSentAt');
      if (!user || user.isEmailVerified !== false) {
        return res.json({ message: 'If this account needs verification, a code will be sent.' });
      }

      const lastSentAt = user.emailVerificationCodeSentAt?.getTime();
      if (Number.isFinite(lastSentAt) && now - lastSentAt < EMAIL_VERIFICATION_RESEND_COOLDOWN_MS) {
        return res.status(429).json({
          error: 'Please wait before requesting another verification code.',
          retryAfterSeconds: Math.ceil((EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000),
        });
      }

      const expiresAt = await issueEmailVerificationCode(user, smtpConfig);
      return res.json({
        message: 'If this account needs verification, a code will be sent.',
        expiresInSeconds: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        resendAfterSeconds: Math.ceil(EMAIL_VERIFICATION_RESEND_COOLDOWN_MS / 1000),
      });
    } catch (error) {
      return next(error);
    }
  };

  router.post(['/send-verification-code', '/resend-verification-code'], sendVerificationCodeHandler);

  router.post('/verify-email', async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: 'Enter a valid email and 6-digit verification code.' });
      }
      const now = new Date();
      const ipKey = `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
      const emailKey = `email:${email}`;
      if (
        !consumeRateLimit(verificationAttemptRequests, ipKey, 30, PASSWORD_RESET_RATE_LIMIT_WINDOW_MS) ||
        !consumeRateLimit(verificationAttemptRequests, emailKey, 10, PASSWORD_RESET_RATE_LIMIT_WINDOW_MS)
      ) {
        return res.status(429).json({ error: 'Too many verification attempts. Please try again later.' });
      }

      const codeHash = createEmailCodeHash(secret, 'email-verification', email, code);
      const user = await UserModel.findOne({
        email,
        active: true,
        isEmailVerified: false,
        emailVerificationCodeExpiresAt: { $gt: now },
        emailVerificationCodeAttempts: { $lt: EMAIL_VERIFICATION_CODE_MAX_ATTEMPTS },
      }).select('+emailVerificationCodeHash +emailVerificationCodeExpiresAt +emailVerificationCodeAttempts');
      if (
        !user ||
        typeof user.emailVerificationCodeHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(user.emailVerificationCodeHash) ||
        !timingSafeEqual(Buffer.from(user.emailVerificationCodeHash, 'hex'), Buffer.from(codeHash, 'hex'))
      ) {
        if (user) {
          await UserModel.updateOne(
            {
              _id: user._id,
              emailVerificationCodeHash: user.emailVerificationCodeHash,
              emailVerificationCodeExpiresAt: { $gt: now },
              emailVerificationCodeAttempts: { $lt: EMAIL_VERIFICATION_CODE_MAX_ATTEMPTS },
            },
            { $inc: { emailVerificationCodeAttempts: 1 } }
          );
        }
        return res.status(400).json({ error: 'The verification code is invalid or has expired.' });
      }

      const verifiedUser = await UserModel.findOneAndUpdate(
        {
          _id: user._id,
          isEmailVerified: false,
          emailVerificationCodeHash: codeHash,
          emailVerificationCodeExpiresAt: { $gt: now },
          emailVerificationCodeAttempts: { $lt: EMAIL_VERIFICATION_CODE_MAX_ATTEMPTS },
        },
        {
          $set: { isEmailVerified: true },
          $unset: {
            emailVerificationCodeHash: 1,
            emailVerificationCodeExpiresAt: 1,
            emailVerificationCodeAttempts: 1,
            emailVerificationCodeSentAt: 1,
          },
        },
        { new: true }
      );
      if (!verifiedUser) {
        return res.status(400).json({ error: 'The verification code is invalid or has expired.' });
      }
      return res.json({
        message: 'Email successfully verified.',
        token: createAccessToken(verifiedUser.id, secret, verifiedUser.tokenVersion),
        user: publicUser(verifiedUser),
      });
    } catch (error) {
      return next(error);
    }
  });

  const passwordResetSendHandler = async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
      }

      const smtpConfig = getSmtpConfig();
      if (!smtpConfig) {
        return res.status(503).json({ error: 'Password reset email is not configured on the server.' });
      }

      const now = Date.now();
      const rateLimitKey = `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
      if (!consumeRateLimit(
        passwordResetRequests,
        rateLimitKey,
        PASSWORD_RESET_RATE_LIMIT_MAX,
        PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
        now
      )) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }

      const user = await UserModel.findOne({ email, active: true })
        .select('+passwordResetCodeSentAt');
      const genericResponse = {
        message: 'If an active account exists for this email, a password reset code will be sent.',
      };
      if (!user) {
        return res.json(genericResponse);
      }

      const lastSentAt = user.passwordResetCodeSentAt?.getTime();
      if (Number.isFinite(lastSentAt) && now - lastSentAt < PASSWORD_RESET_RESEND_COOLDOWN_MS) {
        return res.json(genericResponse);
      }

      const resetCode = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const resetCodeHash = createHmac('sha256', secret)
        .update(`${email}:${resetCode}`)
        .digest('hex');
      user.passwordResetCodeHash = resetCodeHash;
      user.passwordResetCodeExpiresAt = new Date(now + PASSWORD_RESET_CODE_TTL_MS);
      user.passwordResetCodeAttempts = 0;
      user.passwordResetCodeSentAt = new Date(now);
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpiresAt = undefined;
      await user.save();

      try {
        await sendPasswordResetCode(smtpConfig, user.email, resetCode);
      } catch (error) {
        await UserModel.updateOne(
          { _id: user._id, passwordResetCodeHash: resetCodeHash },
          {
            $unset: {
              passwordResetCodeHash: 1,
              passwordResetCodeExpiresAt: 1,
              passwordResetCodeAttempts: 1,
              passwordResetCodeSentAt: 1,
            },
          }
        );
        console.error(
          'Password reset email delivery failed:',
          error instanceof Error ? error.message : 'Unknown SMTP error.'
        );
        return res.json(genericResponse);
      }

      return res.json(genericResponse);
    } catch (error) {
      return next(error);
    }
  };

  router.post(['/password-reset/request', '/forgot-password'], passwordResetSendHandler);
  router.post(['/password-reset/resend-code', '/resend-reset-code'], passwordResetSendHandler);

  router.post(['/password-reset/verify-code', '/verify-reset-code'], async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: 'Enter the valid 6-digit verification code.' });
      }

      const nowMs = Date.now();
      const ipKey = `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
      const emailKey = `email:${email}`;
      if (
        !consumeRateLimit(passwordResetAttempts, ipKey, 30, PASSWORD_RESET_RATE_LIMIT_WINDOW_MS, nowMs) ||
        !consumeRateLimit(passwordResetAttempts, emailKey, 10, PASSWORD_RESET_RATE_LIMIT_WINDOW_MS, nowMs)
      ) {
        return res.status(429).json({ error: 'Too many verification attempts. Please try again later.' });
      }

      const codeHash = createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
      const now = new Date();
      const user = await UserModel.findOne({
        email,
        active: true,
        passwordResetCodeExpiresAt: { $gt: now },
        passwordResetCodeAttempts: { $lt: PASSWORD_RESET_CODE_MAX_ATTEMPTS },
      }).select('+passwordResetCodeHash +passwordResetCodeExpiresAt +passwordResetCodeAttempts');

      if (
        !user ||
        typeof user.passwordResetCodeHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(user.passwordResetCodeHash) ||
        !timingSafeEqual(Buffer.from(user.passwordResetCodeHash, 'hex'), Buffer.from(codeHash, 'hex'))
      ) {
        if (user) {
          await UserModel.updateOne(
            {
              _id: user._id,
              passwordResetCodeHash: user.passwordResetCodeHash,
              passwordResetCodeExpiresAt: { $gt: now },
              passwordResetCodeAttempts: { $lt: PASSWORD_RESET_CODE_MAX_ATTEMPTS },
            },
            { $inc: { passwordResetCodeAttempts: 1 } }
          );
        }
        return res.status(400).json({ error: 'This verification code is invalid or has expired.' });
      }

      const resetToken = randomBytes(32).toString('hex');
      const resetTokenHash = createHash('sha256').update(resetToken).digest('hex');
      const updatedUser = await UserModel.findOneAndUpdate(
        {
          _id: user._id,
          passwordResetCodeHash: codeHash,
          passwordResetCodeExpiresAt: { $gt: now },
          passwordResetCodeAttempts: { $lt: PASSWORD_RESET_CODE_MAX_ATTEMPTS },
          active: true,
        },
        {
          $set: {
            passwordResetTokenHash: resetTokenHash,
            passwordResetExpiresAt: new Date(nowMs + PASSWORD_RESET_TOKEN_TTL_MS),
          },
          $unset: {
            passwordResetCodeHash: 1,
            passwordResetCodeExpiresAt: 1,
            passwordResetCodeAttempts: 1,
            passwordResetCodeSentAt: 1,
          },
        },
        { new: true }
      );
      if (!updatedUser) {
        return res.status(400).json({ error: 'This verification code is invalid or has expired.' });
      }

      return res.json({ resetToken });
    } catch (error) {
      return next(error);
    }
  });

  router.post(['/password-reset/complete', '/reset-password'], async (req, res, next) => {
    try {
      const token = typeof req.body?.token === 'string' ? req.body.token : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const passwordIsComplex =
        /[a-z]/.test(password) &&
        /[A-Z]/.test(password) &&
        /\d/.test(password) &&
        /[^A-Za-z0-9]/.test(password);
      if (!/^[a-f0-9]{64}$/.test(token) || password.length < PASSWORD_MIN_LENGTH || !passwordIsComplex) {
        return res.status(400).json({
          error: `Use a valid reset link and a password of at least ${PASSWORD_MIN_LENGTH} characters with lowercase, uppercase, number, and symbol characters.`,
        });
      }

      const passwordHash = await hashPassword(password);
      const user = await UserModel.findOneAndUpdate(
        {
          passwordResetTokenHash: createHash('sha256').update(token).digest('hex'),
          passwordResetExpiresAt: { $gt: new Date() },
          active: true,
        },
        {
          $set: { passwordHash },
          $inc: { tokenVersion: 1 },
          $unset: {
            passwordResetTokenHash: 1,
            passwordResetExpiresAt: 1,
            passwordResetCodeHash: 1,
            passwordResetCodeExpiresAt: 1,
            passwordResetCodeAttempts: 1,
            passwordResetCodeSentAt: 1,
          },
        },
        { new: true }
      );
      if (!user) {
        return res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
      }
      return res.json({ message: 'Your password has been reset. You can now log in.' });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/register', async (req, res, next) => {
    try {
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
      const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body.password === 'string' ? req.body.password : '';
      const role = req.body.role ?? 'business_owner';
      if (
        !name ||
        name.length > 120 ||
        !phone ||
        phone.length > 40 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        password.length < PASSWORD_MIN_LENGTH ||
        role !== 'business_owner'
      ) {
        return res.status(400).json({
          error: `Provide a name, phone number, valid email, the business_owner role, and a password of at least ${PASSWORD_MIN_LENGTH} characters.`,
        });
      }
      const smtpConfig = getSmtpConfig();
      if (!smtpConfig) {
        return res.status(503).json({ error: 'Email verification is not configured on the server.' });
      }
      const registrationKey = req.ip || req.socket.remoteAddress || 'unknown';
      if (!consumeRateLimit(registrationRequests, registrationKey, 5, PASSWORD_RESET_RATE_LIMIT_WINDOW_MS)) {
        return res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
      }

      const userId = new mongoose.Types.ObjectId();
      const tenantId = String(userId);
      const user = await UserModel.create({
        _id: userId,
        tenantId,
        createdBy: userId,
        createdByName: name,
        name,
        email,
        phone,
        role,
        active: true,
        isEmailVerified: false,
        passwordHash: await hashPassword(password),
      });

      try {
        const trial = createTrialLicense();
        await WorkspaceModel.create({
          ownerId: tenantId,
          scope: 'shared',
          data: { server_license: trial },
        });
        await WorkspaceModel.create({
          ownerId: tenantId,
          scope: 'user',
          data: structuredClone(EMPTY_USER_WORKSPACE_DATA),
        });
        await LicenseAuditModel.create({
          tenantId,
          actorId: String(user._id),
          actorName: user.name,
          action: 'trial_activated',
          occurredAt: new Date(trial.activationDate.replace(' ', 'T') + 'Z'),
          details: {
            planId: trial.planId,
            activationDate: trial.activationDate,
            expiryDate: trial.expiryDate,
          },
        });
      } catch (error) {
        await WorkspaceModel.deleteMany({ ownerId: tenantId });
        await UserModel.deleteOne({ _id: userId });
        throw error;
      }
      await UserActivityModel.create({
        action: 'registered',
        actorId: String(user._id),
        actorName: user.name,
        targetUserId: String(user._id),
        targetName: user.name,
        targetEmail: user.email,
        targetRole: user.role,
        tenantId,
      });

      let emailSent = true;
      try {
        await issueEmailVerificationCode(user, smtpConfig);
      } catch (error) {
        emailSent = false;
        console.error('Registration verification email could not be sent:', error);
      }
      return res.status(201).json({
        email: user.email,
        verificationRequired: true,
        emailSent,
        expiresInSeconds: Math.floor(EMAIL_VERIFICATION_CODE_TTL_MS / 1000),
        resendAfterSeconds: emailSent ? Math.ceil(EMAIL_VERIFICATION_RESEND_COOLDOWN_MS / 1000) : 0,
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      return next(error);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body.password === 'string' ? req.body.password : '';
      const user = await UserModel.findOne({ email }).select('+passwordHash');
      if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      if (user.isEmailVerified === false) {
        return res.status(403).json({
          error: 'Email address has not been verified.',
          verificationRequired: true,
          email: user.email,
        });
      }
      return res.json({
        token: createAccessToken(user.id, secret, user.tokenVersion),
        user: publicUser(user),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

  router.get('/users', authenticate, requireUserOrEmployeeManagement, async (_req, res, next) => {
    try {
      const canManageUsers = await hasPermission(_req.user, 'manage_users');
      const tenantFilter = getTenantUserFilter(getTenantId(_req.user));
      const filter = canManageUsers
        ? _req.user.role === 'admin'
          ? { $and: [tenantFilter, { deletedAt: null }] }
          : { $and: [tenantFilter, { role: { $nin: ['admin', 'business_owner', 'super_admin'] } }, { deletedAt: null }] }
        : { $and: [tenantFilter, { monthlySalary: { $gt: 0 } }, { deletedAt: null }] };
      const users = await UserModel.find(filter)
        .sort({ createdAt: 1 })
        .select('-passwordHash');
      return res.json({ users: users.map(publicUser) });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/users', authenticate, requireUserOrEmployeeManagement, async (req, res, next) => {
    try {
      const {
        name,
        email,
        phone = '',
        monthlySalary,
        jobTitle = '',
        address = '',
        dateOfBirth = '',
        employeeDetails,
        active = true,
        role,
        password,
      } = req.body;
      const canManageUsers = await hasPermission(req.user, 'manage_users');
      if (!canManageUsers && (
        monthlySalary === undefined ||
        monthlySalary <= 0 ||
        role !== 'employee' ||
        active !== true ||
        password !== undefined
      )) {
        return res.status(403).json({ error: 'Employee managers can create active employee-role profiles only; user access and passwords require user-management permission.' });
      }
      const employeeDetailsError = validateEmployeeDetails(employeeDetails);
      if (employeeDetailsError) {
        return res.status(400).json({ error: employeeDetailsError });
      }
      if (
        typeof name !== 'string' ||
        !name.trim() ||
        typeof email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof phone !== 'string' ||
        !phone.trim() ||
        (monthlySalary !== undefined && (
          typeof monthlySalary !== 'number' ||
          !Number.isFinite(monthlySalary) ||
          monthlySalary <= 0
        )) ||
        typeof jobTitle !== 'string' ||
        jobTitle.length > 120 ||
        typeof address !== 'string' ||
        address.length > 500 ||
        !isValidDateOfBirth(dateOfBirth) ||
        (dateOfBirth !== '' && typeof dateOfBirth !== 'string') ||
        typeof active !== 'boolean' ||
        ![
          'manager',
          'cashier',
          'accountant',
          'business_admin',
          'branch_manager',
          'inventory_manager',
          'hr_manager',
          'employee',
        ].includes(role) ||
        (password !== undefined && (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH))
      ) {
        return res.status(400).json({
          error: `Provide a name, valid email, and role. A supplied password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
        });
      }
      if (role === 'business_admin' && !['admin', 'business_owner'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Only the business owner can assign business administrator access.' });
      }
      if (monthlySalary !== undefined) {
        const requiredEmployeeDetailsError = validateRequiredEmployeeFields({
          name,
          monthlySalary,
          dateOfBirth,
          address,
          employeeDetails,
        });
        if (requiredEmployeeDetailsError) {
          return res.status(400).json({ error: requiredEmployeeDetailsError });
        }
      }

      const tenantId = getTenantId(req.user);
      const profileDetails = employeeDetails ? { ...employeeDetails } : (monthlySalary !== undefined ? {} : undefined);
      if (profileDetails?.serialNumber) {
        const duplicateEmployeeNumber = await UserModel.exists({
          ...getTenantUserFilter(tenantId),
          'employeeDetails.serialNumber': profileDetails.serialNumber,
        });
        if (duplicateEmployeeNumber) {
          return res.status(409).json({ error: 'Employee number is already in use.' });
        }
      } else if (monthlySalary !== undefined) {
        profileDetails.serialNumber = `EMP-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
      }
      const temporaryPassword = password || createTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const sharedWorkspace = await WorkspaceModel.findOne({
        ownerId: tenantId,
        scope: 'shared',
      }).lean();
      const planSettings = await SubscriptionPlanModel.findOne({
        planId: sharedWorkspace?.data?.server_license?.planId,
      }).select('userLimit').lean();
      const userLimit = Number.isSafeInteger(planSettings?.userLimit)
        ? planSettings.userLimit
        : getLicenseLimits(sharedWorkspace?.data?.server_license?.planId).users;
      const userCount = await UserModel.countDocuments({
        ...getTenantUserFilter(tenantId),
        deletedAt: null,
        role: { $ne: 'super_admin' },
      });
      if (userCount >= userLimit) {
        return res.status(403).json({ error: 'PLAN_USER_LIMIT_REACHED' });
      }

      const user = await UserModel.create({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        tenantId,
        createdBy: String(req.user._id),
        createdByName: req.user.name,
        phone: phone.trim(),
        monthlySalary: monthlySalary ?? 0,
        jobTitle: jobTitle.trim(),
        address: address.trim(),
        dateOfBirth,
        ...(profileDetails ? { employeeDetails: profileDetails } : {}),
        role,
        active,
        passwordHash,
      });
      await UserActivityModel.create({
        action: 'user_created',
        actorId: String(req.user._id),
        actorName: req.user.name,
        targetUserId: String(user._id),
        targetName: user.name,
        targetEmail: user.email,
        targetRole: user.role,
        tenantId,
      });
      return res.status(201).json({ user: publicUser(user), temporaryPassword });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      return next(error);
    }
  });

  router.patch('/users/:id', authenticate, requireUserOrEmployeeManagement, async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ error: 'User ID is invalid.' });
      }

      const tenantId = getTenantId(req.user);
      const tenantFilter = getTenantUserFilter(tenantId);
      const user = await UserModel.findOne({ $and: [{ _id: id }, tenantFilter, { deletedAt: null }] });
      if (!user) return res.status(404).json({ error: 'User not found.' });
      const canManageUsers = await hasPermission(req.user, 'manage_users');
      if (!canManageUsers && (
        !(Number(user.monthlySalary) > 0) ||
        (req.body.role !== undefined && req.body.role !== user.role) ||
        (req.body.active !== undefined && req.body.active !== user.active) ||
        req.body.password !== undefined
      )) {
        return res.status(403).json({ error: 'Employee managers may update employee profiles only; user access and passwords require user-management permission.' });
      }
      if (
        ['admin', 'business_owner', 'business_admin'].includes(user.role) &&
        !['admin', 'business_owner'].includes(req.user.role)
      ) {
        return res.status(403).json({ error: 'Only the business owner can manage privileged accounts.' });
      }

      const {
        name,
        email,
        phone,
        dateOfBirth,
        address,
        jobTitle,
        monthlySalary,
        employeeDetails,
        role,
        active,
        password,
      } = req.body;
      const updates = {};
      const employeeDetailsError = validateEmployeeDetails(employeeDetails);
      if (employeeDetailsError) {
        return res.status(400).json({ error: employeeDetailsError });
      }
      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({ error: 'Name cannot be empty.' });
        }
        updates.name = name.trim();
      }
      if (email !== undefined) {
        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          return res.status(400).json({ error: 'Provide a valid email address.' });
        }
        updates.email = email.trim().toLowerCase();
      }
      if (phone !== undefined) {
        if (typeof phone !== 'string') {
          return res.status(400).json({ error: 'Phone number must be text.' });
        }
        updates.phone = phone.trim();
      }
      if (dateOfBirth !== undefined) {
        if (!isValidDateOfBirth(dateOfBirth)) {
          return res.status(400).json({ error: 'Date of birth must be a valid date that is not in the future.' });
        }
        updates.dateOfBirth = dateOfBirth;
      }
      if (address !== undefined) {
        if (typeof address !== 'string' || address.length > 500) {
          return res.status(400).json({ error: 'Address must be text.' });
        }
        updates.address = address.trim();
      }
      if (jobTitle !== undefined) {
        if (typeof jobTitle !== 'string' || jobTitle.length > 120) {
          return res.status(400).json({ error: 'Job title must be text.' });
        }
        updates.jobTitle = jobTitle.trim();
      }
      if (monthlySalary !== undefined) {
        if (typeof monthlySalary !== 'number' || !Number.isFinite(monthlySalary) || monthlySalary < 0) {
          return res.status(400).json({ error: 'Monthly salary must be a number greater than or equal to zero.' });
        }
        updates.monthlySalary = monthlySalary;
      }
      if (employeeDetails !== undefined) {
        const nextEmployeeNumber = employeeDetails?.serialNumber;
        if (nextEmployeeNumber && nextEmployeeNumber !== user.employeeDetails?.serialNumber) {
          const duplicateEmployeeNumber = await UserModel.exists({
            ...tenantFilter,
            _id: { $ne: user._id },
            'employeeDetails.serialNumber': nextEmployeeNumber,
          });
          if (duplicateEmployeeNumber) {
            return res.status(409).json({ error: 'Employee number is already in use.' });
          }
        }
        updates.employeeDetails = employeeDetails;
      }
      const nextMonthlySalary = updates.monthlySalary ?? user.monthlySalary;
      const employeeFieldsChanged = monthlySalary !== undefined ||
        employeeDetails !== undefined ||
        dateOfBirth !== undefined ||
        address !== undefined;
      if (nextMonthlySalary > 0 && employeeFieldsChanged) {
        const storedEmployeeDetails = user.employeeDetails?.toObject
          ? user.employeeDetails.toObject()
          : user.employeeDetails || {};
        const requiredEmployeeDetailsError = validateRequiredEmployeeFields({
          name: updates.name ?? user.name,
          monthlySalary: nextMonthlySalary,
          dateOfBirth: updates.dateOfBirth ?? user.dateOfBirth,
          address: updates.address ?? user.address,
          employeeDetails: { ...storedEmployeeDetails, ...(updates.employeeDetails || {}) },
        });
        if (requiredEmployeeDetailsError) {
          return res.status(400).json({ error: requiredEmployeeDetailsError });
        }
      }
      if (role !== undefined) {
        if (![
          'admin',
          'manager',
          'cashier',
          'accountant',
          'business_owner',
          'business_admin',
          'branch_manager',
          'inventory_manager',
          'hr_manager',
          'employee',
        ].includes(role)) {
          return res.status(400).json({ error: 'Role is invalid.' });
        }
        if (['admin', 'business_owner'].includes(role) && req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Only the business administrator can assign owner access.' });
        }
        if (role === 'business_admin' && !['admin', 'business_owner'].includes(req.user.role)) {
          return res.status(403).json({ error: 'Only the business owner can assign business administrator access.' });
        }
        if (String(user._id) === String(req.user._id) && role !== 'admin') {
          return res.status(403).json({ error: 'You cannot remove your own administrator role.' });
        }
        updates.role = role;
      }
      if (active !== undefined) {
        if (typeof active !== 'boolean') {
          return res.status(400).json({ error: 'Account status must be active or inactive.' });
        }
        if (String(user._id) === String(req.user._id) && !active) {
          return res.status(403).json({ error: 'You cannot deactivate your own account.' });
        }
        updates.active = active;
      }
      if (password !== undefined && (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH)) {
        return res.status(400).json({
          error: `A supplied password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
        });
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid user changes were provided.' });
      }

      const temporaryPassword = password ? password : null;
      if (temporaryPassword) {
        updates.passwordHash = await hashPassword(temporaryPassword);
      }

      const nextRole = updates.role ?? user.role;
      const nextActive = updates.active ?? user.active;
      if (user.role === 'admin' && user.active && (nextRole !== 'admin' || !nextActive)) {
        const activeAdmins = await UserModel.countDocuments({
          ...tenantFilter,
          role: 'admin',
          active: true,
        });
        if (activeAdmins <= 1) {
          return res.status(409).json({ error: 'The last active administrator cannot be removed or deactivated.' });
        }
      }

      Object.assign(user, updates);
      await user.save();
      await UserActivityModel.create({
        action: 'user_updated',
        actorId: String(req.user._id),
        actorName: req.user.name,
        targetUserId: String(user._id),
        targetName: user.name,
        targetEmail: user.email,
        targetRole: user.role,
        tenantId,
      });
      return res.json({ user: publicUser(user), temporaryPassword });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      return next(error);
    }
  });

  router.delete('/users/:id', authenticate, requireUserManagement, async (req, res, next) => {
    return res.status(403).json({
      error: 'Only the platform Administrator can delete accounts from the user recycling bin.',
    });
  });

  return router;
}
