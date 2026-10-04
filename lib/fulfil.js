import crypto from 'crypto';
import { getPool } from './db';
import { nextMembershipNo, nextReceiptNo } from './sequences';
import { buildReceiptFileName, generateReceiptPDF } from './receipt';
import { isEmailConfigured, sendReceiptEmail } from './email';
import { logPaymentEvent } from './paymentEvents';
import { getSiteUrl } from './seo';

/**
 * Turns a confirmed payment into a member record + receipt, exactly once.
 *
 * Both the browser callback (/api/razorpay/verify) and the Razorpay webhook
 * call this. Whichever arrives first does the work; the second is a no-op that
 * returns the same result. That is what makes closing the tab mid-payment safe.
 *
 * Idempotency comes from `select ... for update` on the payment row plus the
 * early return when status is already 'paid'.
 */
export async function fulfilPayment({ paymentRowId, razorpayOrderId, razorpayPaymentId, signature = null, memberExtras = null, source = 'server' }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('begin');

    const lookup = paymentRowId
      ? await client.query('select * from payments where id = $1 for update', [paymentRowId])
      : await client.query('select * from payments where razorpay_order_id = $1 for update', [razorpayOrderId]);

    if (!lookup.rows.length) {
      await client.query('rollback');
      return { ok: false, status: 404, error: 'Payment record not found.' };
    }

    const payment = lookup.rows[0];

    // Already fulfilled — return the existing result rather than duplicating.
    if (payment.status === 'paid') {
      await client.query('commit');
      return {
        ok: true,
        alreadyFulfilled: true,
        receiptId: payment.id,
        receiptNo: payment.receipt_no,
        membershipNo: payment.membership_no,
        profileUrl: await profileUrlFor(payment.member_id),
      };
    }

    let memberId = payment.member_id;
    let membershipNo = null;
    let profileToken = null;

    if (payment.payment_kind === 'membership_new') {
      membershipNo = await nextMembershipNo(payment.membership_type);
      profileToken = crypto.randomBytes(24).toString('hex');
      const { rows } = await client.query(
        `insert into members
           (full_name, phone, email, address, pan_number, blood_group, date_of_birth, date_of_anniversary,
            membership_type, membership_no, valid_from, valid_till, email_verified, profile_token)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, current_date, $11, $12, $13)
         returning id, profile_token`,
        [
          payment.payer_name, payment.payer_phone, payment.payer_email, payment.payer_address,
          memberExtras?.panNumber || null, memberExtras?.bloodGroup || null,
          memberExtras?.dateOfBirth || null, memberExtras?.dateOfAnniversary || null,
          payment.membership_type, membershipNo, payment.valid_till,
          payment.email_verified === true, profileToken,
        ]
      );
      memberId = rows[0].id;
      profileToken = rows[0].profile_token;
    } else if (payment.payment_kind === 'membership_renew') {
      const { rows } = await client.query(
        `update members
            set valid_till = $1,
                email_verified = email_verified or $2,
                profile_token = coalesce(profile_token, encode(gen_random_bytes(24), 'hex')),
                updated_at = now()
          where id = $3
        returning membership_no, profile_token`,
        [payment.valid_till, payment.email_verified === true, payment.member_id]
      );
      membershipNo = rows[0]?.membership_no || null;
      profileToken = rows[0]?.profile_token || null;
    }

    const receiptNo = await nextReceiptNo();

    await client.query(
      `update payments set
         status = 'paid',
         razorpay_payment_id = coalesce($1, razorpay_payment_id),
         razorpay_signature = coalesce($2, razorpay_signature),
         receipt_no = $3,
         membership_no = $4,
         member_id = $5,
         paid_at = now()
       where id = $6`,
      [razorpayPaymentId, signature, receiptNo, membershipNo, memberId, payment.id]
    );

    await client.query('commit');

    await logPaymentEvent({
      paymentId: payment.id,
      eventType: 'captured',
      source,
      razorpayOrderId: payment.razorpay_order_id,
      razorpayPaymentId,
      amount: payment.amount,
      payload: { receiptNo, membershipNo },
    });

    // Receipt generation and email happen AFTER commit: a mail failure must
    // never roll back a successful payment.
    const profileUrl = profileToken ? `${getSiteUrl()}/profile/${profileToken}` : null;
    queueReceiptDelivery(payment.id, profileUrl);

    return { ok: true, receiptId: payment.id, receiptNo, membershipNo, profileUrl };
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error('fulfilPayment failed:', err);
    return { ok: false, status: 500, error: err.message || 'Could not complete the payment.' };
  } finally {
    client.release();
  }
}

async function profileUrlFor(memberId) {
  if (!memberId) return null;
  const { rows } = await getPool().query('select profile_token from members where id = $1', [memberId]);
  const token = rows[0]?.profile_token;
  return token ? `${getSiteUrl()}/profile/${token}` : null;
}

/**
 * Renders the receipt, stores it, and emails it.
 * Deliberately not awaited by the request path — the donor shouldn't wait on
 * SMTP — but every outcome is recorded in receipt_emails / payment_events.
 */
export function queueReceiptDelivery(paymentId, profileUrl) {
  deliverReceipt(paymentId, profileUrl).catch((err) =>
    console.error('Receipt delivery failed for', paymentId, err.message)
  );
}

export async function deliverReceipt(paymentId, profileUrl = null) {
  const pool = getPool();
  const { rows } = await pool.query(
    `select p.*, m.full_name as member_full_name, m.profile_token
       from payments p
       left join members m on m.id = p.member_id
      where p.id = $1`,
    [paymentId]
  );
  if (!rows.length) throw new Error('Payment not found');
  const payment = rows[0];
  if (payment.status !== 'paid') throw new Error('Payment is not paid');

  // Render and cache the PDF if we haven't already.
  let pdf = payment.receipt_pdf;
  let fileName = payment.receipt_file_name || buildReceiptFileName(payment);
  if (!pdf || pdf.length === 0) {
    pdf = Buffer.from(await generateReceiptPDF(payment));
    await pool.query(
      'update payments set receipt_pdf = $1, receipt_file_name = $2, receipt_generated_at = now() where id = $3',
      [pdf, fileName, paymentId]
    );
  } else {
    pdf = Buffer.from(pdf);
  }

  if (!isEmailConfigured()) {
    await pool.query(
      'insert into receipt_emails (payment_id, to_email, status, error) values ($1,$2,$3,$4)',
      [paymentId, payment.payer_email, 'failed', 'SMTP not configured']
    );
    return { sent: false, reason: 'SMTP not configured' };
  }

  const url = profileUrl || (payment.profile_token ? `${getSiteUrl()}/profile/${payment.profile_token}` : null);

  try {
    await sendReceiptEmail({
      to: payment.payer_email,
      payerName: payment.payer_name,
      receiptNo: payment.receipt_no,
      amount: payment.amount,
      towards: payment.towards,
      membershipNo: payment.membership_no,
      validTill: payment.valid_till ? new Date(payment.valid_till).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : null,
      pdfBuffer: pdf,
      fileName,
      profileUrl: url,
      // Drives the greeting, the tier badge and the subject line.
      membershipType: payment.membership_type,
      isMembership: String(payment.payment_kind || '').startsWith('membership'),
    });
    await pool.query(
      'insert into receipt_emails (payment_id, to_email, status) values ($1,$2,$3)',
      [paymentId, payment.payer_email, 'sent']
    );
    await logPaymentEvent({ paymentId, eventType: 'receipt_emailed', payload: { to: payment.payer_email } });
    return { sent: true };
  } catch (err) {
    await pool.query(
      'insert into receipt_emails (payment_id, to_email, status, error) values ($1,$2,$3,$4)',
      [paymentId, payment.payer_email, 'failed', String(err.message).slice(0, 500)]
    );
    throw err;
  }
}

/** Records a failed payment so the admin panel can see abandoned attempts. */
export async function markPaymentFailed({ razorpayOrderId, razorpayPaymentId, reason, source = 'webhook' }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `update payments
        set status = case when status = 'paid' then status else 'failed' end,
            failure_reason = $1,
            razorpay_payment_id = coalesce($2, razorpay_payment_id)
      where razorpay_order_id = $3
      returning id, status`,
    [String(reason || '').slice(0, 500), razorpayPaymentId, razorpayOrderId]
  );
  if (rows.length) {
    await logPaymentEvent({
      paymentId: rows[0].id,
      eventType: 'failed',
      source,
      razorpayOrderId,
      razorpayPaymentId,
      payload: { reason },
    });
  }
  return rows[0] || null;
}
