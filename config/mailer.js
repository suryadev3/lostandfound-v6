/**
 * Email sender – prefers Resend (reliable on Render), falls back to Gmail SMTP.
 *
 * Recommended (easiest & most reliable on free Render):
 *   1. Create free account at https://resend.com
 *   2. Create an API key
 *   3. In Render Environment set:  RESEND_API_KEY=re_xxxxxxxx
 *   (No domain required for testing – emails come from onboarding@resend.dev)
 *
 * Optional Gmail:
 *   EMAIL_USER=your@gmail.com
 *   EMAIL_PASS=16-char App Password (not your normal password)
 */

const nodemailer = require("nodemailer");

function resendConfigured() {
  return !!(process.env.RESEND_API_KEY || "").trim();
}

function gmailConfigured() {
  const user = (process.env.EMAIL_USER || "").trim();
  const pass = (process.env.EMAIL_PASS || "").replace(/\s+/g, "");
  return !!(user && pass);
}

function emailConfigured() {
  return resendConfigured() || gmailConfigured();
}

async function sendViaResend({ from, to, subject, html }) {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from || "Lost & Found <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.error || `Resend HTTP ${res.status}`);
    }
    console.log(`Email sent to ${to} via Resend: ${data.id || "ok"}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaGmail({ from, to, subject, html }) {
  const auth = {
    user: (process.env.EMAIL_USER || "").trim(),
    pass: (process.env.EMAIL_PASS || "").replace(/\s+/g, ""),
  };

  const attempts = [
    { host: "smtp.gmail.com", port: 465, secure: true, label: "465/SSL" },
    { host: "smtp.gmail.com", port: 587, secure: false, label: "587/STARTTLS" },
  ];

  let lastErr;
  for (const cfg of attempts) {
    try {
      const transport = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth,
        connectionTimeout: 12000,
        greetingTimeout: 12000,
        socketTimeout: 15000,
        tls: { rejectUnauthorized: false },
      });

      const info = await Promise.race([
        transport.sendMail({ from, to, subject, html }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout on ${cfg.label}`)), 15000)
        ),
      ]);

      console.log(`Email sent to ${to} via Gmail ${cfg.label}: ${info.messageId}`);
      try { transport.close(); } catch (_) {}
      return info;
    } catch (err) {
      console.error(`Gmail ${cfg.label} failed:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error("All Gmail SMTP attempts failed");
}

async function sendMail({ to, subject, html }) {
  const fromEnv = (process.env.EMAIL_FROM || "").trim();

  // 1. Prefer Resend (works reliably from Render free)
  if (resendConfigured()) {
    const from = fromEnv || "Lost & Found Portal <onboarding@resend.dev>";
    return sendViaResend({ from, to, subject, html });
  }

  // 2. Fallback to Gmail SMTP
  if (gmailConfigured()) {
    const from =
      fromEnv ||
      `"Lost & Found Portal" <${(process.env.EMAIL_USER || "").trim()}>`;
    return sendViaGmail({ from, to, subject, html });
  }

  // 3. No credentials → Ethereal test inbox (preview link in logs)
  console.log("No RESEND_API_KEY or EMAIL_USER/EMAIL_PASS — using Ethereal test inbox");
  const testAccount = await nodemailer.createTestAccount();
  const testTransport = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
    connectionTimeout: 10000,
    socketTimeout: 12000,
  });
  const info = await testTransport.sendMail({
    from: fromEnv || '"Lost & Found Portal" <no-reply@lostfound.app>',
    to,
    subject,
    html,
  });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) console.log(`\nPreview email (test mode): ${previewUrl}\n`);
  return info;
}

module.exports = { sendMail, emailConfigured, resendConfigured, gmailConfigured };
