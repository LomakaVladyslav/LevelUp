import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer, { SendMailOptions } from 'nodemailer';
import { sendPasswordResetEmail } from './mail.service';

test('password reset mail renders with the upgraded transport without network delivery', async () => {
  const original = nodemailer.createTransport;
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_FROM = 'LevelUp <noreply@example.test>';
  const transport = original({ streamTransport: true, buffer: true, newline: 'unix' });
  let message = '';
  const sendMail = transport.sendMail.bind(transport);
  transport.sendMail = (async (options: SendMailOptions) => {
    const info = await sendMail(options);
    message = info.message.toString();
    assert.deepEqual(info.envelope.to, ['user@example.test']);
    return info;
  }) as typeof transport.sendMail;
  nodemailer.createTransport = (() => transport) as typeof original;
  try {
    await sendPasswordResetEmail({ to: 'user@example.test', username: '<private>', resetUrl: 'https://example.test/reset?token=test' });
    assert.match(message, /Reset your LevelUp password/);
    assert.match(message, /&lt;private&gt;/);
    assert.match(message, /token=3Dtest/);
  } finally {
    nodemailer.createTransport = original;
    if (host === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = host;
    if (from === undefined) delete process.env.SMTP_FROM; else process.env.SMTP_FROM = from;
  }
});
