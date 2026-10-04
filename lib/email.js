import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

/**
 * Transactional email over Gmail SMTP.
 *
 * ⚠️ IMPORTANT — Gmail will NOT accept your normal account password.
 * Google disabled "less secure app access" in 2022. You must create a
 * 16-character **App Password**:
 *
 *   1. Turn on 2-Step Verification on the Google account.
 *   2. Go to https://myaccount.google.com/apppasswords
 *   3. Create an app password and paste it into SMTP_PASS (spaces are fine).
 *
 * Gmail's free tier allows roughly 500 messages/day, which is comfortably
 * more than this site will send. If the trust later outgrows that, swap this
 * module for Resend/SendGrid — nothing outside this file needs to change.
 */

let transporter;

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!isEmailConfigured()) {
    throw new Error('SMTP_USER / SMTP_PASS are not set. See .env.example — Gmail needs an App Password, not your login password.');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
      auth: {
        user: process.env.SMTP_USER,
        // App passwords are usually shown with spaces; Gmail ignores them.
        pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
      },
      // Nodemailer's defaults wait 2 minutes to connect and 10 minutes on a
      // silent socket. Someone watching a "Send code" spinner has given up
      // long before that, and the request pins a server connection for the
      // whole wait. Fail in seconds instead, so the retry in sendMail can run.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

function fromAddress() {
  const name = process.env.SMTP_FROM_NAME || process.env.NEXT_PUBLIC_TRUST_NAME || 'Pune CKP Family Public Trust';
  return `"${name}" <${process.env.SMTP_USER}>`;
}

/** Verifies SMTP credentials without sending anything. Used by the diagnostics script. */
export async function verifyEmailConnection() {
  return getTransporter().verify();
}

/**
 * Flattens a nodemailer error into one loggable line. The useful part of an
 * SMTP failure is usually in `response` ("535 Bad credentials", "454 too many
 * login attempts"), which is nowhere in `err.message`.
 */
export function describeMailError(err) {
  return [
    err?.message,
    err?.code && `code=${err.code}`,
    err?.responseCode && `responseCode=${err.responseCode}`,
    err?.command && `command=${err.command}`,
    err?.response && `response=${String(err.response).trim()}`,
  ].filter(Boolean).join(' | ');
}

/** True for failures about the connection rather than the message itself. */
function isTransientMailError(err) {
  if (['ETIMEDOUT', 'ECONNECTION', 'ECONNRESET', 'ESOCKET', 'ECONNREFUSED', 'EDNS', 'EAI_AGAIN'].includes(err?.code)) {
    return true;
  }
  // A 4xx SMTP reply means "try again later" by definition; 5xx is permanent.
  const code = Number(err?.responseCode);
  return code >= 400 && code < 500;
}

export async function sendMail({ to, subject, html, text, attachments }) {
  const message = { from: fromAddress(), to, subject, text, html, attachments };
  try {
    return await getTransporter().sendMail(message);
  } catch (err) {
    if (!isTransientMailError(err)) throw err;
    // Gmail over a flaky link drops connections often enough that one retry
    // turns most of it invisible. Anything worse is a real outage and should
    // surface to the caller.
    console.warn('SMTP send failed, retrying once:', describeMailError(err));
    return getTransporter().sendMail(message);
  }
}

// ---------------------------------------------------------------------------
// Templates
//
// Written as table-based HTML with inline styles, because that is what email
// clients actually render — Gmail strips <style> blocks, Outlook ignores flex
// and grid. The logo is attached and referenced by CID rather than hotlinked,
// so it displays even when a client blocks remote images by default.
// ---------------------------------------------------------------------------

const BRAND = {
  saffron: '#F4A62C',
  saffronLight: '#FEF6E8',
  vermilion: '#D30000',
  vermilionDark: '#8A0000',
  cream: '#FDF5E7',
  ink: '#2B1A0E',
  muted: '#8a7a6a',
};

const LOGO_CID = 'ckp-trust-logo';

/** Logo as an inline CID attachment. Falls back to no image if the file is missing. */
function logoAttachment() {
  try {
    const candidates = ['logo-receipt.png', 'logo.png']
      .map((f) => path.join(process.cwd(), 'public', 'logo', f))
      .filter((p) => fs.existsSync(p));
    if (!candidates.length) return null;
    return { filename: 'logo.png', path: candidates[0], cid: LOGO_CID, contentDisposition: 'inline' };
  } catch {
    return null;
  }
}

function shell(title, bodyHtml, { hasLogo = true, accent = BRAND.vermilion } = {}) {
  const trust = process.env.NEXT_PUBLIC_TRUST_NAME || 'Pune CKP Family Public Trust';
  const site = process.env.NEXT_PUBLIC_TRUST_WEBSITE || 'https://puneckptrust.in';
  const phone = process.env.NEXT_PUBLIC_TRUST_PHONE || '7447794477';
  const mail = process.env.NEXT_PUBLIC_TRUST_EMAIL || 'puneckpfamily@gmail.com';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${title}</title>
</head>
<body style="margin:0;padding:28px 12px;background:${BRAND.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};-webkit-font-smoothing:antialiased;">
  <!-- Preheader: the grey preview line in the inbox list -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${title} — ${trust}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
   <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background:#ffffff;border:1px solid #F0DEB8;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px -18px rgba(139,0,0,0.35);">

      <!-- Header band -->
      <tr><td style="background:${accent};background-image:linear-gradient(135deg,${accent} 0%,${BRAND.vermilionDark} 100%);padding:28px 24px;text-align:center;">
        ${hasLogo ? `<img src="cid:${LOGO_CID}" width="72" height="72" alt="${trust} emblem"
             style="display:block;margin:0 auto 14px;width:72px;height:72px;border-radius:50%;border:3px solid ${BRAND.saffron};background:#fff;">` : ''}
        <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">${trust}</div>
        <div style="font-size:11px;color:${BRAND.saffron};letter-spacing:2.5px;margin-top:8px;">समाज हिताय सर्वजनसुखाय</div>
      </td></tr>

      <!-- Gold rule -->
      <tr><td style="height:4px;background:${BRAND.saffron};background-image:linear-gradient(90deg,${BRAND.saffron},#ffd88a,${BRAND.saffron});font-size:0;line-height:0;">&nbsp;</td></tr>

      <tr><td style="padding:30px 28px;">${bodyHtml}</td></tr>

      <tr><td style="padding:18px 28px 26px;border-top:1px solid #F0DEB8;background:${BRAND.saffronLight};font-size:11px;color:${BRAND.muted};text-align:center;line-height:1.7;">
        <strong style="color:${BRAND.ink};">${trust}</strong><br>
        Reg. No. E-8167 · PAN AADTP7440A<br>
        602 Niranka CHS, Ideal Society, Paud Road, Kothrud, Pune 411038<br>
        <a href="tel:${phone}" style="color:${BRAND.vermilion};text-decoration:none;">${phone}</a> ·
        <a href="mailto:${mail}" style="color:${BRAND.vermilion};text-decoration:none;">${mail}</a><br>
        <a href="${site}" style="color:${BRAND.vermilion};font-weight:600;text-decoration:none;">${site.replace(/^https?:\/\//, '')}</a>
      </td></tr>
    </table>
   </td></tr>
  </table>
</body></html>`;
}

/** Bulletproof-ish rounded button that survives Outlook. */
function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto;">
    <tr><td align="center" style="border-radius:999px;background:${BRAND.vermilion};">
      <a href="${href}" style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${label}</a>
    </td></tr></table>`;
}

export async function sendOtpEmail({ to, otp, minutes = 10 }) {
  const body = `
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:${BRAND.ink};text-align:center;">You're one step away ✨</h1>
    <p style="margin:0 0 4px;font-size:14px;color:#6b5c4d;text-align:center;line-height:1.6;">
      Enter this code on the website to confirm your email, then complete your payment.
    </p>

    <div style="margin:26px 0 18px;text-align:center;">
      <div style="display:inline-block;padding:18px 34px;background:${BRAND.saffronLight};border:2px dashed ${BRAND.saffron};border-radius:14px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${BRAND.muted};margin-bottom:8px;">Your verification code</div>
        <div style="font-size:38px;font-weight:700;letter-spacing:12px;font-family:'SFMono-Regular',Consolas,'Courier New',monospace;color:${BRAND.vermilion};">${otp}</div>
      </div>
    </div>

    <p style="margin:0 0 16px;font-size:13px;color:${BRAND.muted};text-align:center;">
      ⏱ Expires in ${minutes} minutes · one-time use
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border-top:1px solid #F0DEB8;">
      <tr><td style="padding-top:16px;font-size:12px;color:${BRAND.muted};line-height:1.7;">
        <strong style="color:${BRAND.ink};">Didn't request this?</strong> You can safely ignore this email —
        no payment has been taken and nothing has been registered in your name.
      </td></tr>
    </table>`;

  const logo = logoAttachment();
  return sendMail({
    to,
    subject: `${otp} — your Pune CKP Trust verification code ✨`,
    text: `Your Pune CKP Family Public Trust verification code is ${otp}.\n\nEnter it on the website to confirm your email before completing your payment. It expires in ${minutes} minutes and can only be used once.\n\nDidn't request this? Ignore this email — no payment has been taken.`,
    html: shell('Your verification code', body, { hasLogo: Boolean(logo) }),
    attachments: logo ? [logo] : undefined,
  });
}

const TIER_LABEL = { silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };

export async function sendReceiptEmail({
  to, payerName, receiptNo, amount, towards, membershipNo, validTill,
  pdfBuffer, fileName, profileUrl, membershipType = null, isMembership = false,
}) {
  const amountStr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(amount || 0));
  const firstName = String(payerName || '').trim().split(/\s+/)[0] || 'Friend';
  const tier = membershipType ? TIER_LABEL[membershipType] : null;

  const heading = isMembership
    ? `Welcome to the family, ${firstName}! 🎉`
    : `Thank you, ${firstName} 🙏`;

  const lede = isMembership
    ? `Your ${tier ? `<strong>${tier}</strong> ` : ''}membership is confirmed and registered. Your official receipt is attached to this email.`
    : 'Your donation has been received and put to work. Your official receipt is attached to this email.';

  const rows = [
    ['Receipt No.', `<span style="font-family:'SFMono-Regular',Consolas,monospace;">${receiptNo}</span>`],
    ['Amount', `<span style="color:${BRAND.vermilion};font-size:15px;">₹${amountStr}</span>`],
    ['Towards', towards],
    membershipNo ? ['Membership No.', `<span style="font-family:'SFMono-Regular',Consolas,monospace;color:${BRAND.vermilion};">${membershipNo}</span>`] : null,
    validTill ? ['Valid till', validTill] : null,
  ].filter(Boolean);

  const body = `
    <h1 style="margin:0 0 10px;font-size:23px;font-weight:700;color:${BRAND.ink};text-align:center;">${heading}</h1>
    <p style="margin:0 0 22px;font-size:14px;color:#6b5c4d;text-align:center;line-height:1.65;">${lede}</p>

    ${tier ? `<div style="text-align:center;margin:0 0 22px;">
      <span style="display:inline-block;padding:7px 18px;border-radius:999px;background:${BRAND.saffronLight};border:1px solid ${BRAND.saffron};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8f4f1d;">${tier} Member</span>
    </div>` : ''}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.saffronLight};border:1px solid #F0DEB8;border-radius:14px;margin:0 0 6px;">
      ${rows.map(([k, v], i) => `<tr>
        <td style="padding:11px 18px;font-size:13px;color:${BRAND.muted};${i ? 'border-top:1px solid #F5E6CC;' : ''}">${k}</td>
        <td style="padding:11px 18px;font-size:13px;font-weight:600;text-align:right;color:${BRAND.ink};${i ? 'border-top:1px solid #F5E6CC;' : ''}">${v}</td>
      </tr>`).join('')}
    </table>

    <p style="margin:14px 0 0;font-size:12px;color:${BRAND.muted};text-align:center;">
      📎 Your official PDF receipt is attached to this email
    </p>

    ${profileUrl ? `${button(profileUrl, isMembership ? 'Open your membership card →' : 'View your receipts →')}
    <p style="margin:0;font-size:12px;color:${BRAND.muted};text-align:center;line-height:1.6;">
      Save this link — it opens your ${isMembership ? 'membership card, validity and ' : ''}full receipt history at any time.
    </p>` : ''}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-top:1px solid #F0DEB8;">
      <tr><td style="padding-top:18px;font-size:12px;color:${BRAND.muted};line-height:1.75;">
        Please keep the attached receipt for your records — it carries the trust's registration number and PAN.
        If anything on it is wrong, just reply to this email and it will be corrected.
      </td></tr>
    </table>

    <p style="margin:22px 0 0;font-size:13px;color:${BRAND.ink};text-align:center;font-style:italic;">
      <span style="font-size:15px;">समाजाचे देणं समाजालाच द्यावं</span><br>
      <span style="font-size:11px;color:${BRAND.muted};">What society gives, return to society.</span>
    </p>`;

  const subject = isMembership
    ? `🎉 Welcome to the Pune CKP Family${tier ? ` — ${tier} membership` : ''} confirmed (${receiptNo})`
    : `🙏 Thank you for your ₹${amountStr} donation — receipt ${receiptNo} attached`;

  const logo = logoAttachment();
  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename: fileName || `${String(receiptNo).replace(/\//g, '-')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    });
  }
  if (logo) attachments.push(logo);

  return sendMail({
    to,
    subject,
    text: `${heading.replace(/[🎉🙏]/g, '').trim()}\n\n${lede.replace(/<[^>]+>/g, '')}\n\nReceipt No: ${receiptNo}\nAmount: Rs. ${amountStr}\nTowards: ${towards}\n${membershipNo ? `Membership No: ${membershipNo}\n` : ''}${validTill ? `Valid till: ${validTill}\n` : ''}\nYour official receipt is attached as a PDF.${profileUrl ? `\n\nYour profile: ${profileUrl}` : ''}\n\n— ${process.env.NEXT_PUBLIC_TRUST_NAME || 'Pune CKP Family Public Trust'}`,
    html: shell(`Receipt ${receiptNo}`, body, { hasLogo: Boolean(logo) }),
    attachments: attachments.length ? attachments : undefined,
  });
}
