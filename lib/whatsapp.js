/**
 * WhatsApp messages through Meta's WhatsApp Business (Cloud) API.
 *
 * What the trust must set up once (see README): a WhatsApp Business account
 * with a phone number, a permanent access token, and ONE approved message
 * template with a single text variable in its body, for example
 *
 *     Pune CKP Family Public Trust: {{1}}
 *
 * WhatsApp does not allow a business to start a conversation with free text;
 * the first message to anyone must be an approved template. The text typed by
 * the trustee goes into that variable.
 *
 * Environment: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE,
 * WHATSAPP_TEMPLATE_LANG (default "en").
 *
 * Until those are set, isWhatsAppConfigured() is false and the screens offer
 * a "send from my own WhatsApp" link per person instead (whatsAppLink()).
 */

const API = 'https://graph.facebook.com/v20.0';

export function isWhatsAppConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TEMPLATE);
}

/** An Indian mobile number as WhatsApp wants it (digits only, with 91), or null. */
export function whatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** A link that opens WhatsApp on the trustee's own phone or computer with the text ready to send. */
export function whatsAppLink(phone, text) {
  const number = whatsAppNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}

/** Sends the template with `text` as its one variable. Throws on failure. */
export async function sendWhatsApp(phone, text) {
  if (!isWhatsAppConfigured()) throw new Error('WhatsApp is not set up');
  let to = whatsAppNumber(phone);
  if (!to) throw new Error('not a mobile number');
  // Demo mode: the data is a copy of real members, so messages go to the demo number or nowhere.
  if (String(process.env.DATA_MODE || '').toLowerCase() === 'demo') {
    to = whatsAppNumber(process.env.DEMO_WHATSAPP_TO);
    if (!to) return { demo: true, skipped: true };
  }
  // Template variables may not contain new lines, tabs or runs of spaces.
  const clean = String(text).replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 1000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: process.env.WHATSAPP_TEMPLATE,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: clean }] }],
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail?.error?.message || `WhatsApp answered ${res.status}`);
    }
    return { ok: true };
  } finally {
    clearTimeout(timer);
  }
}
