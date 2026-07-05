import nodemailer from 'nodemailer';

type PasswordResetEmail = {
  to: string;
  username: string;
  resetUrl: string;
};

const isSmtpConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });

export const sendPasswordResetEmail = async ({
  to,
  username,
  resetUrl,
}: PasswordResetEmail): Promise<void> => {
  if (!isSmtpConfigured()) {
    console.warn(
      `SMTP is not configured. Password reset link for ${to}: ${resetUrl}`,
    );
    return;
  }

  await createTransporter().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Reset your LevelUp password',
    html: [
      '<!doctype html>',
      '<html>',
      '<body style="font-family:Arial,sans-serif;line-height:1.5;color:#211b3d;">',
      `<p>Hi ${escapeHtml(username)},</p>`,
      '<p>Use this link to reset your LevelUp password:</p>',
      `<p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#6c47ff;color:#ffffff;padding:12px 16px;border-radius:10px;text-decoration:none;font-weight:700;">Reset password</a></p>`,
      `<p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>`,
      '<p>This link expires in 30 minutes. If you did not request it, ignore this email.</p>',
      '</body>',
      '</html>',
    ].join(''),
    text: [
      `Hi ${username},`,
      '',
      'Use this link to reset your LevelUp password:',
      resetUrl,
      '',
      'This link expires in 30 minutes. If you did not request it, ignore this email.',
    ].join('\n'),
  });
};
