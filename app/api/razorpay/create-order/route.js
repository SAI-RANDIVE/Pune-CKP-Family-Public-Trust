import { NextResponse } from 'next/server';
import { getPool } from '../../../../lib/db';
import { getRazorpay } from '../../../../lib/razorpay';
import { computeNewMembership, computeRenewal, validateDonationAmount, MEMBERSHIP_LABELS } from '../../../../lib/pricing';
import { rupeesToWords } from '../../../../lib/numberToWords';
import { checkVerification, consumeVerification } from '../../../../lib/otp';
import { validatePayer } from '../../../../lib/validate';
import { clientIp, rateLimit } from '../../../../lib/rateLimit';
import { logPaymentEvent } from '../../../../lib/paymentEvents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bad(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return bad('Invalid request.');
  }

  const ip = clientIp(req);
  const limited = await rateLimit({ key: `order:create:ip:${ip}`, limit: 15, windowSeconds: 900 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many payment attempts. Please wait a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    );
  }

  // --- Validate the payer server-side, whatever the browser claims ---------
  const payerCheck = validatePayer(body.payer);
  if (!payerCheck.ok) return bad(payerCheck.errors[0]);
  const payer = payerCheck.value;

  // --- The email must have been verified by OTP ---------------------------
  const verification = await checkVerification(body.verificationToken, payer.email);
  if (!verification.ok) return bad(verification.error, 403);

  const pool = getPool();

  try {
    let amount, towards, validTill = null, membershipType = null, memberId = null, paymentKind;

    if (body.kind === 'donation') {
      amount = validateDonationAmount(body.amount);
      towards = 'Donation to Pune CKP Family Public Trust';
      paymentKind = 'donation';
    } else if (body.kind === 'membership') {
      membershipType = body.membershipType;
      if (!['silver', 'gold', 'platinum'].includes(membershipType)) {
        return bad('Please choose a membership tier.');
      }
      const label = MEMBERSHIP_LABELS[membershipType];

      if (body.membershipAction === 'renew') {
        const membershipNo = String(body.membershipNo || '').trim();
        const { rows } = membershipNo
          ? await pool.query('select * from members where membership_no = $1', [membershipNo])
          : await pool.query(
              'select * from members where phone = $1 and email = $2 order by created_at desc limit 1',
              [payer.phone, payer.email]
            );

        if (!rows.length) {
          return bad('We could not find an existing membership matching those details. Check your membership number, or sign up as a new member.');
        }
        const member = rows[0];

        // The email is OTP-verified, so require it to match the member on file.
        // Without this, knowing someone's membership number would be enough to
        // read back and extend their membership.
        if (member.email && member.email.toLowerCase() !== payer.email) {
          return bad('That membership is registered to a different email address. Please use the email on record, or contact the trust.');
        }
        if (member.membership_type !== membershipType) {
          return bad(`This membership number is registered as ${MEMBERSHIP_LABELS[member.membership_type]}, not ${label}.`);
        }

        const calc = computeRenewal(
          membershipType,
          member.valid_till ? member.valid_till.toISOString().slice(0, 10) : null
        );
        amount = calc.totalAmount;
        validTill = calc.validTill;
        memberId = member.id;
        towards = `Membership ${label}, Renew`;
        paymentKind = 'membership_renew';
      } else {
        const calc = computeNewMembership(membershipType);
        amount = calc.totalAmount;
        validTill = calc.validTill;
        towards = `Membership ${label}, New`;
        paymentKind = 'membership_new';
      }
    } else {
      return bad('Please choose membership or donation.');
    }

    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: `ckp-${Date.now()}`,
      notes: { kind: paymentKind, membershipType: membershipType || '', email: payer.email },
    });

    const { rows } = await pool.query(
      `insert into payments
        (member_id, payment_kind, membership_type, amount, currency, razorpay_order_id, status,
         towards, valid_till, payer_name, payer_phone, payer_email, payer_address, amount_in_words,
         email_verified, verification_id)
       values ($1,$2,$3,$4,'INR',$5,'created',$6,$7,$8,$9,$10,$11,$12,true,$13)
       returning id`,
      [
        memberId, paymentKind, membershipType, amount, order.id,
        towards, validTill, payer.name, payer.phone, payer.email, payer.address,
        `${rupeesToWords(amount)} Only`, verification.verificationId,
      ]
    );

    await consumeVerification(verification.verificationId);
    await logPaymentEvent({
      paymentId: rows[0].id,
      eventType: 'order_created',
      source: 'server',
      razorpayOrderId: order.id,
      amount,
      payload: { kind: paymentKind, membershipType, ip },
    });

    return NextResponse.json({
      paymentRowId: rows[0].id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      towards,
      validTill,
    });
  } catch (err) {
    console.error('create-order failed:', err);
    const message = err.error?.description || err.message || 'Could not start the payment.';
    return bad(message, 500);
  }
}
