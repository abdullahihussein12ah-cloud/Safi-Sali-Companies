import nodemailer from 'nodemailer';

const COMPANY_NAME = 'SAFI SALI COMPANIES';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const legacyFrom = process.env.SMTP_FROM?.trim() || '';
  const legacyAddress = legacyFrom.match(/<([^<>]+)>/)?.[1] || legacyFrom;
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim() || legacyAddress;
  const fromName = process.env.SMTP_FROM_NAME?.trim() ||
    legacyFrom.match(/^(.+?)\s*</)?.[1]?.trim() ||
    COMPANY_NAME;
  const port = Number(process.env.SMTP_PORT || 587);
  const secureSetting = process.env.SMTP_SECURE?.trim().toLowerCase() || '';
  const secure = secureSetting === 'true' || port === 465;
  const configuredValues = [host, user, password, fromEmail, fromName];
  const hasPlaceholder = configuredValues.some((value) =>
    /example\.com|your-|replace-with|placeholder/i.test(value || '')
  );

  if (
    hasPlaceholder ||
    !host ||
    !user ||
    !password ||
    !fromEmail ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !fromName ||
    !['true', 'false', ''].includes(secureSetting)
  ) {
    return null;
  }
  return { host, user, password, fromEmail, fromName, port, secure };
}

function createTransporter(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });
}

function emailLayout({ greeting, title, description, code, expiry, footer }) {
  const safeGreeting = escapeHtml(greeting);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCode = escapeHtml(code);
  const safeFooter = escapeHtml(footer);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head><body style="margin:0;background:#f3f6fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#14213d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><tr><td style="height:7px;background:linear-gradient(90deg,#0b1733,#2457d6,#d6ad55)"></td></tr><tr><td style="padding:32px 28px 12px;text-align:center"><div style="font-size:20px;font-weight:800;letter-spacing:.4px;color:#0b1733">${COMPANY_NAME}</div><div style="margin-top:7px;font-size:12px;color:#64748b">Professional Business Management Platform</div></td></tr><tr><td style="padding:20px 28px 32px"><p style="font-size:15px;line-height:1.6">${safeGreeting}</p><h1 style="font-size:21px;color:#0b1733">${safeTitle}</h1><p style="font-size:15px;line-height:1.65;color:#475569">${safeDescription}</p><div style="margin:24px 0;padding:18px 12px;border:1px solid #dbe5f3;border-radius:12px;background:#f8faff;text-align:center;font-size:32px;line-height:1.2;font-weight:800;letter-spacing:9px;color:#2457d6">${safeCode}</div><p style="font-size:14px;line-height:1.6;color:#475569">This code expires in ${expiry} minutes. Please do not share this code with anyone.</p><p style="margin-top:24px;font-size:14px;line-height:1.6;color:#475569">Best regards,<br><strong>${COMPANY_NAME}</strong><br>${safeFooter}</p></td></tr></table><p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:11px;line-height:1.5;color:#94a3b8">If you did not request this, please ignore this email.</p></td></tr></table></body></html>`;
}

export async function sendEmailVerificationCode(config, user, code) {
  const html = emailLayout({
    greeting: 'Hello,',
    title: 'Verify Your Email Address',
    description: 'Thank you for registering with SAFI SALI COMPANIES. Your email verification code is:',
    code,
    expiry: 10,
    footer: 'Professional Business Management Platform.',
  });
  await createTransporter(config).sendMail({
    from: { name: config.fromName, address: config.fromEmail },
    to: user.email,
    subject: 'SAFI SALI COMPANIES – Email Verification Code',
    text: `Hello,\n\nThank you for registering with ${COMPANY_NAME}.\n\nYour email verification code is: ${code}\n\nThis code expires in 10 minutes.\nPlease do not share this code with anyone.\n\nIf you did not request this verification, please ignore this email.\n\nBest regards,\n${COMPANY_NAME}\nProfessional Business Management Platform.`,
    html,
  });
}

export async function sendPasswordResetCode(config, email, code) {
  const html = emailLayout({
    greeting: 'Hello,',
    title: 'Reset Your Password',
    description: `We received a request to reset your ${COMPANY_NAME} account password. Your verification code is:`,
    code,
    expiry: 10,
    footer: 'Professional Business Management Platform.',
  });
  await createTransporter(config).sendMail({
    from: { name: config.fromName, address: config.fromEmail },
    to: email,
    subject: 'SAFI SALI COMPANIES – Password Reset Verification Code',
    text: `Hello,\n\nWe received a request to reset your SAFI SALI COMPANIES account password.\n\nYour verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you did not request a password reset, please ignore this email.\n\nSAFI SALI COMPANIES\nProfessional Business Management Platform.`,
    html,
  });
}
