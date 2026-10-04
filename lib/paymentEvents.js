import { getPool } from './db';

/**
 * Append-only audit trail for every payment state change.
 *
 * This exists so reconciliation never depends on the Razorpay dashboard being
 * available or on a single mutable `status` column. Logging must never break a
 * payment, so failures here are swallowed and logged, not thrown.
 */
export async function logPaymentEvent({
  paymentId = null,
  eventId = null,
  eventType,
  source = 'server',
  razorpayOrderId = null,
  razorpayPaymentId = null,
  amount = null,
  payload = null,
  client = null,
}) {
  const runner = client || getPool();
  try {
    const { rows } = await runner.query(
      `insert into payment_events
         (payment_id, event_id, event_type, source, razorpay_order_id, razorpay_payment_id, amount, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (event_id) do nothing
       returning id`,
      [paymentId, eventId, eventType, source, razorpayOrderId, razorpayPaymentId, amount, payload ? JSON.stringify(payload) : null]
    );
    // No row means this event_id was already recorded — a webhook replay.
    return { inserted: rows.length > 0, id: rows[0]?.id || null };
  } catch (err) {
    console.error('Failed to log payment event', eventType, err.message);
    return { inserted: false, id: null };
  }
}

export async function listPaymentEvents(paymentId) {
  const { rows } = await getPool().query(
    'select * from payment_events where payment_id = $1 order by created_at asc',
    [paymentId]
  );
  return rows;
}
