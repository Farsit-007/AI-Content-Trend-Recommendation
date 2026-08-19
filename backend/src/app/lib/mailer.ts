import nodemailer, { Transporter } from 'nodemailer';
import config from '../config';
import { logger } from './logger';

/**
 * Outbound mail, deliberately soft.
 *
 * Every caller must treat delivery as best-effort: with `SMTP_HOST` unset (tests, local dev, any
 * deployment that hasn't configured mail yet) `isMailConfigured()` is false, `sendMail` no-ops, and
 * the caller falls back to whatever it did before — which for password reset means logging the link.
 * That keeps this addition from turning a missing env var into a broken boot or a failed request.
 */

let transporter: Transporter | null = null;

export const isMailConfigured = (): boolean => Boolean(config.mail.host && config.mail.from);

const getTransporter = (): Transporter | null => {
  if (!isMailConfigured()) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    // Some relays (internal MTAs, Mailpit in dev) accept unauthenticated submission.
    auth: config.mail.user && config.mail.password ? { user: config.mail.user, pass: config.mail.password } : undefined,
  });
  return transporter;
};

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Returns whether the message was actually handed to a transport. Never throws. */
export const sendMail = async (message: MailMessage): Promise<boolean> => {
  const transport = getTransporter();
  if (!transport) {
    logger.warn({ to: message.to, subject: message.subject }, '[mailer] SMTP is not configured — mail not sent');
    return false;
  }

  try {
    await transport.sendMail({ from: config.mail.from, ...message });
    logger.info({ to: message.to, subject: message.subject }, '[mailer] Mail sent');
    return true;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err, to: message.to },
      '[mailer] Failed to send mail',
    );
    return false;
  }
};

/**
 * Password-reset mail. The link points at the frontend's `/reset-password` route, which reads the
 * token from the query string — so `WEB_URL` has to be the deployed frontend origin, not the API's.
 */
export const sendPasswordResetMail = async (to: string, token: string, name?: string): Promise<boolean> => {
  const base = (config.web_url ?? 'http://localhost:5173').replace(/\/+$/, '');
  const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;
  const greeting = name ? `Hi ${name},` : 'Hi,';

  return sendMail({
    to,
    subject: 'Reset your Growth Studio password',
    text: [
      greeting,
      '',
      'Use this link to set a new password. It expires in 15 minutes:',
      link,
      '',
      "If you didn't ask for this, you can ignore this email — your password stays unchanged.",
    ].join('\n'),
    html: [
      `<p>${greeting}</p>`,
      '<p>Use this link to set a new password. It expires in 15 minutes:</p>',
      `<p><a href="${link}">Set a new password</a></p>`,
      "<p style=\"color:#666\">If you didn't ask for this, you can ignore this email — your password stays unchanged.</p>",
    ].join(''),
  });
};
