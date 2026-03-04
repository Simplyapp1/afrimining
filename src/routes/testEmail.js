import { Router } from 'express';
import { requireAuth, loadUser } from '../middleware/auth.js';
import { sendEmail, isEmailConfigured } from '../lib/emailService.js';

const router = Router();

/**
 * POST /api/test-email
 * Send a test email to verify SMTP (EMAIL_USER / EMAIL_PASS).
 * Body: { to?: string } — optional; defaults to the logged-in user's email.
 * Requires auth.
 */
router.post('/', requireAuth, loadUser, async (req, res) => {
  if (!isEmailConfigured()) {
    return res.status(503).json({
      error: 'Email not configured',
      hint: 'Set EMAIL_USER and EMAIL_PASS in .env (use a Gmail App Password for Gmail).',
    });
  }

  const to = (req.body?.to && String(req.body.to).trim()) || req.user?.email;
  if (!to || !to.includes('@')) {
    return res.status(400).json({
      error: 'No recipient',
      hint: 'Provide { "to": "your@email.com" } in the body, or ensure your user account has an email.',
    });
  }

  const html = `
    <div style="font-family: sans-serif; max-width: 560px;">
      <h2 style="color: #1a1a1a;">Thinkers – test email</h2>
      <p>This is a test email from the Thinkers app.</p>
      <p>If you received this, your email configuration (SMTP / App Password) is working.</p>
      <p style="color: #666; font-size: 14px;">Sent at ${new Date().toISOString()}</p>
    </div>
  `;

  try {
    await sendEmail({
      to,
      subject: 'Thinkers – test email',
      body: html,
      html: true,
    });
    return res.json({ ok: true, message: 'Test email sent', to });
  } catch (err) {
    console.error('[test-email]', err?.message || err);
    return res.status(500).json({
      error: err?.message || 'Failed to send test email',
      code: err?.code,
    });
  }
});

/** GET /api/test-email — check if email is configured (no send). */
router.get('/', (req, res) => {
  res.json({
    configured: isEmailConfigured(),
    hint: isEmailConfigured() ? 'POST to this URL with optional { "to": "email@example.com" } to send a test email (requires auth).' : 'Set EMAIL_USER and EMAIL_PASS in .env.',
  });
});

export default router;
