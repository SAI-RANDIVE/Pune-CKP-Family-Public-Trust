import { NextResponse } from 'next/server';
import { verifyPaymentSignature } from '../../../../lib/razorpay';
import { fulfilPayment } from '../../../../lib/fulfil';
import { validateMemberExtras } from '../../../../lib/validate';

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

  const { paymentRowId, razorpay_order_id, razorpay_payment_id, razorpay_signature, member } = body;
  if (!paymentRowId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return bad('Missing payment confirmation fields.');
  }

  // Never trust the browser's "payment succeeded" — check the HMAC.
  const signatureOk = verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });
  if (!signatureOk) {
    return bad('We could not verify this payment. If money was deducted, contact the trust with your payment ID and it will be resolved.', 400);
  }

  const extras = validateMemberExtras(member || {});
  // Bad optional extras shouldn't block a paid membership — drop them and
  // continue rather than failing a payment that has already gone through.
  if (!extras.ok) console.warn('Dropping invalid member extras:', extras.errors);

  const result = await fulfilPayment({
    paymentRowId,
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    signature: razorpay_signature,
    memberExtras: extras.value,
    source: 'server',
  });

  if (!result.ok) return bad(result.error, result.status || 500);

  return NextResponse.json({
    receiptId: result.receiptId,
    receiptNo: result.receiptNo,
    membershipNo: result.membershipNo,
    profileUrl: result.profileUrl,
  });
}
