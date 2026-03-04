/**
 * Send a test email using the app's email config.
 * Usage: node scripts/test-email.js [recipient@email.com]
 * If no recipient is given, sends to EMAIL_USER.
 */
import 'dotenv/config';
import { sendEmail, isEmailConfigured } from '../src/lib/emailService.js';

const to = process.argv[2]?.trim() || process.env.EMAIL_USER?.trim();
if (!to || !to.includes('@')) {
  console.error('Usage: node scripts/test-email.js [recipient@email.com]');
  console.error('If no recipient is given, EMAIL_USER from .env is used.');
  process.exit(1);
}

if (!isEmailConfigured()) {
  console.error('Email not configured. Set EMAIL_USER and EMAIL_PASS in .env');
  process.exit(1);
}

const html = `
  <div style="font-family: sans-serif; max-width: 560px;">
    <h2 style="color: #1a1a1a;">Thinkers – test email</h2>
    <p>This is a test email from the Thinkers app (scripts/test-email.js).</p>
    <p>If you received this, your email configuration (SMTP / App Password) is working.</p>
    <p style="color: #666; font-size: 14px;">Sent at ${new Date().toISOString()}</p>
  </div>
`;

console.log('Sending test email to:', to);
try {
  await sendEmail({
    to,
    subject: 'Thinkers – test email',
    body: html,
    html: true,
  });
  console.log('Test email sent successfully. Check the inbox for', to);
} catch (err) {
  console.error('Failed to send:', err.message);
  process.exit(1);
}
