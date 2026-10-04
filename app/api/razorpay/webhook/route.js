import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { fulfilPayment, markPaymentFailed } from '../../../../lib/fulfil';
import { logPaymentEvent } from '../../../../lib/paymentEvents';
import { getPool } from '../../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook — the source of truth for payment status.
 *
 * Why this matters: if the donor closes the tab straight after paying, the
 * browser callback never fires. Without this endpoint the money is captured at
 * Razorpay but the trust has no record, no receipt and no membership.
 *
 * Setup (Razorpay Dashboard → Settings → Webhooks):
 *   URL    : https://puneckptrust.in/api/razorpay/webhook
 *   Secret : must match RAZORPAY_WEBHOOK_SECRET
 *   Events : payment.captured, payment.failed, order.paid, refund.processed
 *
 * The signature is computed over the RAW body, so the body is read as text and
 * parsed only after verification.
 */
export async function POST(req) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('Webhook received but RAZORPAY_WEBHOOK_SECRET is not set.');
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get('x-razorpay-signature') || '';

  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.warn('Webhook signature mismatch — rejecting.');
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const eventId = req.headers.get('x-razorpay-event-id') || event.id || null;
  const type = event.event;
  const paymentEntity = event.payload?.payment?.entity;
  const refundEntity = event.payload?.refund?.entity;
  const orderId = paymentEntity?.order_id || event.payload?.order?.entity?.id || null;

  // Record the raw event first. `event_id` is unique, so a Razorpay retry of an
  // already-processed event inserts nothing and we can return early.
  const logged = await logPaymentEvent({
    eventId,
    eventType: type,
    source: 'webhook',
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentEntity?.id || null,
    amount: paymentEntity?.amount ? paymentEntity.amount / 100 : null,
    payload: event,
  });

  if (eventId && !logged.inserted) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    switch (type) {
      case 'payment.captured':
      case 'order.paid': {
        if (!orderId) break;
        // No signature here — the webhook HMAC above is the proof.
        await fulfilPayment({
          paymentRowId: null,
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentEntity?.id || null,
          signature: null,
          source: 'webhook',
        });
        break;
      }

      case 'payment.failed': {
        if (!orderId) break;
        await markPaymentFailed({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentEntity?.id || null,
          reason: paymentEntity?.error_description || paymentEntity?.error_reason || 'Payment failed',
          source: 'webhook',
        });
        break;
      }

      case 'refund.processed':
      case 'refund.created': {
        const pid = refundEntity?.payment_id;
        if (!pid) break;
        const pool = getPool();
        const { rows } = await pool.query(
          `update payments
              set status = case when $1::numeric >= amount then 'refunded' else 'partially_refunded' end,
                  refunded_at = now()
            where razorpay_payment_id = $2
            returning id`,
          [(refundEntity.amount || 0) / 100, pid]
        );
        if (rows.length) {
          await logPaymentEvent({
            paymentId: rows[0].id,
            eventType: 'refunded',
            source: 'webhook',
            razorpayPaymentId: pid,
            amount: (refundEntity.amount || 0) / 100,
            payload: refundEntity,
          });
        }
        break;
      }

      default:
        // Logged above; nothing else to do.
        break;
    }
  } catch (err) {
    console.error('Webhook handling failed for', type, err);
    // 500 tells Razorpay to retry, which is what we want — the event is
    // recorded, so the retry will be deduplicated if it did partially succeed.
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
