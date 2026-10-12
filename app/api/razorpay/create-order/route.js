import { NextResponse } from 'next/server';
import { getPool } from '../../../../lib/db';
import { getRazorpay } from '../../../../lib/razorpay';
import { computeNewMembership, computeRenewal, validateDonationAmount, MEMBERSHIP_LABELS } from '../../../../lib/pricing';
import { rupeesToWords } from '../../../../lib/numberToWords';
import { checkVerification, consumeVerification } from '../../../../lib/otp';
import { validatePayer } from '../../../../lib/validate';
import { clientIp, rateLimit } from '../../../../lib/rateLimit';
import { logPaymentEvent } from '../../../../lib/paymentEvents';
import { ensureWebsiteMember, findMembershipById, findMembershipsByEmail, identityMatches, renewalBlock } from '../../../../lib/register';

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
        // The trust register is the source of truth: any ID on the member's card works,
        // new (SLV/MEM/0012) or old (SM/24/173).
        const membershipNo = String(body.membershipNo || '').trim();
        if (!membershipNo) return bad('Please type your membership ID. It is printed on your receipt or membership card.');
        const found = await findMembershipById(membershipNo);
        if (!found) {
          return bad('We could not find a membership with that ID. Please check it, or contact the trust.');
        }
        // The e-mail is proven by a code; the phone is typed. One of them must be the one on record,
        // otherwise knowing somebody's ID would be enough to act on their membership.
        if (!identityMatches(found.person, { email: payer.email, phone: payer.phone })) {
          return bad('The e-mail address or mobile number does not match the one the trust holds for this membership. Please use the one you gave the trust, or contact the trust to update it.');
        }
        if (found.membership.tier !== membershipType) {
          return bad(`This membership is ${MEMBERSHIP_LABELS[found.membership.tier] || found.membership.tier}, not ${label}. Please choose ${MEMBERSHIP_LABELS[found.membership.tier] || 'the right tier'}.`);
        }
        const blocked = await renewalBlock(found);
        if (blocked) return bad(blocked.message, 409);

        const calc = computeRenewal(membershipType, found.membership.expiryDate || new Date().toISOString().slice(0, 10));
        amount = calc.totalAmount;
        validTill = calc.validTill;
        const client = await pool.connect();
        try {
          await client.query('begin');
          memberId = await ensureWebsiteMember(client, found);
          await client.query('commit');
        } catch (err) {
          await client.query('rollback').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
        towards = `Membership ${label}, Renew`;
        paymentKind = 'membership_renew';
      } else {
        // Joining again by mistake is the commonest way a member ends up paying twice.
        const held = await findMembershipsByEmail(payer.email);
        if (held.length) {
          const m = held[0].membership;
          return bad(`This e-mail address already has a ${MEMBERSHIP_LABELS[m.tier] || m.tier} membership (ID ${m.code}). Please choose "Renew" and type that ID instead of joining again.`, 409);
        }
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
         email_verified, verification_id, is_test)
       values ($1,$2,$3,$4,'INR',$5,'created',$6,$7,$8,$9,$10,$11,$12,true,$13,$14)
       returning id`,
      [
        memberId, paymentKind, membershipType, amount, order.id,
        towards, validTill, payer.name, payer.phone, payer.email, payer.address,
        `${rupeesToWords(amount)} Only`, verification.verificationId,
        // Test-mode payments are kept for checking the flow but never counted as trust income.
        String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_'),
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
