import { NextResponse } from 'next/server';
import { clientIp, rateLimit } from '../../../../lib/rateLimit';
import { findMembershipById, maskName, renewalBlock } from '../../../../lib/register';
import { computeRenewal, MEMBERSHIP_LABELS } from '../../../../lib/pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Is this my membership, and can I renew it?" for the renewal form. Given an
 * ID it returns only what the member needs to recognise the record: the tier,
 * a masked name, the validity and what a renewal would cost. No contact
 * details ever leave the server, and the lookups are rate-limited so the IDs
 * cannot be walked through.
 */
export async function GET(request) {
  const id = String(new URL(request.url).searchParams.get('id') || '').trim().slice(0, 40);
  if (id.length < 3) return NextResponse.json({ found: false, message: 'Please type your membership ID.' }, { status: 400 });

  try {
    const limit = await rateLimit({ key: `mlookup:${clientIp(request)}`, limit: 20, windowSeconds: 600 });
    if (!limit.ok) {
      return NextResponse.json({ found: false, message: 'Too many checks. Please wait a few minutes and try again.' }, { status: 429 });
    }
    const found = await findMembershipById(id);
    if (!found) {
      return NextResponse.json({ found: false, message: 'No membership has that ID. Please check the ID on your receipt or membership card.' });
    }
    const { membership, person } = found;
    const blocked = await renewalBlock(found);
    let renewal = null;
    if (!blocked) {
      const calc = computeRenewal(membership.tier, membership.expiryDate || new Date().toISOString().slice(0, 10));
      renewal = { amount: calc.totalAmount, validTill: calc.validTill };
    }
    return NextResponse.json({
      found: true,
      membershipId: membership.code,
      trustId: person.code,
      tier: membership.tier,
      tierLabel: MEMBERSHIP_LABELS[membership.tier] || membership.tier,
      name: maskName(person.name),
      status: membership.status,
      validTill: membership.expiryDate,
      canRenew: !blocked,
      message: blocked ? blocked.message : null,
      renewal,
    });
  } catch (err) {
    console.error('membership lookup failed:', err?.message);
    return NextResponse.json({ found: false, message: 'The check is not working just now. Please try again in a moment.' }, { status: 500 });
  }
}
