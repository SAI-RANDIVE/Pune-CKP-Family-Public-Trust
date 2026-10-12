'use client';

import { useMemo, useState } from 'react';
import MembershipCard from './MembershipCard';
import EmailVerifyStep from './EmailVerifyStep';
import MembershipLookup from './MembershipLookup';
import { FORM_FEE, computeNewMembership } from '../lib/pricing';

const PLANS = [
  {
    type: 'silver',
    title: 'Silver',
    price: '1,000',
    period: '/ year',
    features: ['1-year membership, renewed for ₹1,000 a year', 'First term runs to the next 30 June or 31 December, so a few extra months are added and charged pro rata (for example ₹250 for 3 months)', '₹100 one-time form fee applies to all new members'],
  },
  {
    type: 'gold',
    title: 'Gold',
    price: '5,000',
    period: '/ 5 years',
    features: ['5-year membership', '₹100 one-time form fee applies to all new members', 'Priority at Gaurav Sohala events'],
  },
  {
    type: 'platinum',
    title: 'Platinum',
    price: '10,000',
    period: 'lifetime',
    features: ['Lifetime membership', '₹100 one-time form fee applies to all new members', 'Highest recognition tier'],
  },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const initialForm = {
  fullName: '', phone: '', email: '', address: '',
  panNumber: '', bloodGroup: '', dateOfBirth: '', dateOfAnniversary: '',
  membershipNo: '',
};

export default function MembershipForm() {
  const [plan, setPlan] = useState('silver');
  const [action, setAction] = useState('new'); // 'new' | 'renew'
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState('idle'); // idle | processing | success | error
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null); // { receiptId, receiptNo, profileUrl }
  const [verificationToken, setVerificationToken] = useState(null);
  const [lookup, setLookup] = useState(null); // what the trust register said about the typed ID

  const breakdown = useMemo(() => {
    if (action === 'renew') {
      if (lookup?.found && lookup.renewal && lookup.tier === plan) {
        return { membershipFee: lookup.renewal.amount, registrationFee: 0, totalAmount: lookup.renewal.amount };
      }
      return {
        membershipFee: plan === 'silver' ? 1000 : plan === 'gold' ? 5000 : 10000,
        registrationFee: 0,
        totalAmount: plan === 'silver' ? 1000 : plan === 'gold' ? 5000 : 10000,
      };
    }
    return computeNewMembership(plan);
  }, [action, plan, lookup]);

  // What the total is made of, line by line, so nobody has to ask why Silver is not a round thousand.
  const niceDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const { lines, validity } = useMemo(() => {
    if (action === 'renew') {
      const term = plan === 'silver' ? '1 more year' : plan === 'gold' ? '5 more years' : 'lifetime';
      return {
        lines: [{ label: `${plan.charAt(0).toUpperCase() + plan.slice(1)} renewal`, note: term, amount: breakdown.membershipFee }],
        validity: lookup?.found && lookup.renewal?.validTill
          ? `Your membership is valid until ${lookup.validTill ? niceDate(lookup.validTill) : 'today'}. After this renewal: valid until ${niceDate(lookup.renewal.validTill)}.`
          : 'Check your membership ID below to see the new validity date.',
      };
    }
    if (plan === 'silver') {
      const extraMonths = Math.max(0, (breakdown.months || 12) - 12);
      const extra = breakdown.membershipFee - 1000;
      return {
        lines: [
          { label: 'Silver membership, 1 year', note: '12 months', amount: 1000 },
          ...(extraMonths > 0 ? [{
            label: `${extraMonths} extra month${extraMonths === 1 ? '' : 's'}`,
            note: `to bring your membership up to ${niceDate(breakdown.validTill)}, at ₹1,000 a year`,
            amount: extra,
          }] : []),
          { label: 'Form fee', note: 'once, for new members', amount: breakdown.registrationFee },
        ],
        validity: `Valid from ${niceDate(breakdown.validFrom)} to ${niceDate(breakdown.validTill)}: ${breakdown.months} months in all. Silver memberships all end on 30 June or 31 December, so the first term is a little longer than a year and you pay only for the extra months.`,
      };
    }
    return {
      lines: [
        { label: `${plan === 'gold' ? 'Gold membership, 5 years' : 'Platinum membership, lifetime'}`, amount: breakdown.membershipFee },
        { label: 'Form fee', note: 'once, for new members', amount: breakdown.registrationFee },
      ],
      validity: breakdown.validTill ? `Valid from ${niceDate(breakdown.validFrom)} to ${niceDate(breakdown.validTill)}.` : 'Valid for life from the day you join.',
    };
  }, [action, plan, breakdown, lookup]);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setStatus('processing');

    try {
      const orderRes = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'membership',
          verificationToken,
          membershipType: plan,
          membershipAction: action,
          membershipNo: form.membershipNo || undefined,
          payer: {
            name: form.fullName,
            phone: form.phone,
            email: form.email,
            address: form.address,
          },
        }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error || 'Could not start payment.');

      const scriptOk = await loadRazorpayScript();
      if (!scriptOk) throw new Error('Could not load the payment gateway. Check your internet connection.');

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Pune CKP Family Public Trust',
        description: order.towards,
        order_id: order.orderId,
        prefill: { name: form.fullName, email: form.email, contact: form.phone },
        theme: { color: '#D30000' },
        handler: async (response) => {
          try {
            const verifyRes = await fetch('/api/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                paymentRowId: order.paymentRowId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                member: {
                  panNumber: form.panNumber || null,
                  bloodGroup: form.bloodGroup || null,
                  dateOfBirth: form.dateOfBirth || null,
                  dateOfAnniversary: form.dateOfAnniversary || null,
                },
              }),
            });
            const result = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(result.error || 'Payment verification failed.');
            setReceipt(result);
            setStatus('success');
          } catch (err) {
            setError(err.message);
            setStatus('error');
          }
        },
        modal: {
          ondismiss: () => setStatus('idle'),
        },
      });
      rzp.on('payment.failed', (resp) => {
        setError(resp.error?.description || 'Payment failed.');
        setStatus('error');
      });
      rzp.open();
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  if (status === 'success' && receipt) {
    return (
      <div className="max-w-xl mx-auto text-center bg-cream-100 border border-saffron-200 rounded-3xl p-10 reveal-pop">
        <div className="medallion medallion--gold mx-auto badge-shine" style={{ width: '5.5rem', height: '5.5rem' }}>
          <span className="font-display text-2xl text-cream-100">✓</span>
        </div>
        <h2 className="font-display text-2xl mt-6 text-vermilion-700">Welcome to the family!</h2>
        <p className="text-sm text-ink/70 mt-2">Receipt No. <span className="font-mono font-semibold">{receipt.receiptNo}</span></p>
        {receipt.membershipNo && (
          <p className="text-sm text-ink/70 mt-1">Membership No. <span className="font-mono font-semibold text-vermilion-700">{receipt.membershipNo}</span></p>
        )}
        <p className="text-xs text-ink/60 mt-4 leading-relaxed">Your receipt and membership card link have been emailed to you. Keep that email — it opens your profile any time.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <a
            href={`/api/receipt/${receipt.receiptId}`}
            className="btn-press inline-block rounded-full bg-vermilion-500 text-cream-100 px-7 py-3.5 font-semibold hover:bg-vermilion-600"
          >
            Download Receipt (PDF)
          </a>
          {receipt.profileUrl && (
            <a
              href={receipt.profileUrl}
              className="btn-press inline-block rounded-full border-2 border-vermilion-500 text-vermilion-600 px-7 py-3.5 font-semibold hover:bg-vermilion-50"
            >
              View your profile
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map((p) => (
          <MembershipCard key={p.type} {...p} selected={plan === p.type} onSelect={() => { setPlan(p.type); if (p.type === 'platinum') setAction('new'); }} />
        ))}
      </div>

      {plan !== 'platinum' && (
        <div className="flex justify-center gap-3 mt-8">
          <button type="button" onClick={() => setAction('new')} className={`px-5 py-2 rounded-full text-sm font-semibold border-2 ${action === 'new' ? 'border-vermilion-500 bg-vermilion-50 text-vermilion-700' : 'border-saffron-200 text-ink/60'}`}>
            New Membership
          </button>
          <button type="button" onClick={() => setAction('renew')} className={`px-5 py-2 rounded-full text-sm font-semibold border-2 ${action === 'renew' ? 'border-vermilion-500 bg-vermilion-50 text-vermilion-700' : 'border-saffron-200 text-ink/60'}`}>
            Renew Existing Membership
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-12 max-w-2xl mx-auto bg-cream-100 border border-saffron-200 rounded-3xl p-8 md:p-10 space-y-5">
        <div className="rounded-2xl border border-saffron-200 bg-cream-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-vermilion-600">Payment Summary</p>
              <h3 className="font-display text-xl text-vermilion-700 mt-1">{plan.charAt(0).toUpperCase() + plan.slice(1)} Membership</h3>
            </div>
            <div className="text-right">
              <p className="text-xs text-ink/60">Total due</p>
              <p className="text-2xl font-bold text-ink">₹{breakdown.totalAmount.toLocaleString('en-IN')}</p>
            </div>
          </div>
          <dl className="mt-4 space-y-2 text-sm text-ink/75">
            {lines.map((line) => (
              <div key={line.label} className="flex justify-between gap-4">
                <dt>{line.label}{line.note && <span className="block text-xs text-ink/55">{line.note}</span>}</dt>
                <dd className="shrink-0 tabular-nums">₹{line.amount.toLocaleString('en-IN')}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-saffron-200 pt-2 font-semibold text-ink">
              <dt>Total payable</dt>
              <dd className="tabular-nums">₹{breakdown.totalAmount.toLocaleString('en-IN')}</dd>
            </div>
          </dl>
          {validity && <p className="mt-3 rounded-lg bg-saffron-50 px-3 py-2 text-xs font-medium text-ink/80">{validity}</p>}
          <p className="mt-3 text-xs text-ink/60">
            {action === 'renew'
              ? 'A renewal has no form fee. It adds a full term to the end of your present validity, so paying early never loses you any days.'
              : `A one-time form fee of ₹${FORM_FEE.toLocaleString('en-IN')} is charged for every new membership, across Silver, Gold and Platinum tiers.`}
          </p>
        </div>

        <h3 className="font-display text-xl text-vermilion-700">Your Details</h3>

        {action === 'renew' && (
          <MembershipLookup
            value={form.membershipNo}
            onChange={(v) => setForm((f) => ({ ...f, membershipNo: v }))}
            result={lookup}
            onResult={(r) => {
              setLookup(r);
              // The register knows the tier; no need to make the member pick it.
              if (r?.found && ['silver', 'gold', 'platinum'].includes(r.tier)) setPlan(r.tier);
            }}
          />
        )}

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Full Name" required value={form.fullName} onChange={update('fullName')} />
          <Field label="Phone Number" required type="tel" value={form.phone} onChange={update('phone')} />
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Email ID" required type="email" value={form.email} onChange={update('email')} />
          <Field label="PAN Card Number" value={form.panNumber} onChange={update('panNumber')} placeholder="ABCDE1234F" />
        </div>
        <Field label="Address" required value={form.address} onChange={update('address')} textarea />
        <div className="grid sm:grid-cols-3 gap-5">
          <div>
            <label className="text-xs font-semibold text-ink/60 uppercase tracking-wide">Blood Group</label>
            <select value={form.bloodGroup} onChange={update('bloodGroup')} className="mt-1.5 w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-vermilion-400">
              <option value="">Select</option>
              {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <Field label="Date of Birth" type="date" value={form.dateOfBirth} onChange={update('dateOfBirth')} />
          <Field label="Anniversary Date" type="date" value={form.dateOfAnniversary} onChange={update('dateOfAnniversary')} />
        </div>

        <EmailVerifyStep
          email={form.email}
          verified={Boolean(verificationToken)}
          onVerified={setVerificationToken}
          onReset={() => setVerificationToken(null)}
          disabled={status === 'processing'}
        />

        {error && <p role="alert" className="text-sm text-vermilion-600 bg-vermilion-50 rounded-lg px-4 py-2.5">{error}</p>}

        <button
          type="submit"
          disabled={status === 'processing' || !verificationToken || (action === 'renew' && lookup?.found && !lookup.canRenew)}
          className="btn-press w-full rounded-full bg-vermilion-500 text-cream-100 px-7 py-3.5 font-semibold hover:bg-vermilion-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'processing' ? 'Opening secure checkout…' : !verificationToken ? 'Verify your email to continue' : 'Proceed to Payment'}
        </button>
        <p className="text-xs text-ink/50 text-center">Payments are processed securely via Razorpay. Your PDF receipt is generated automatically after payment.</p>
      </form>
    </div>
  );
}

function Field({ label, required, type = 'text', value, onChange, placeholder, textarea }) {
  return (
    <div>
      <label className="text-xs font-semibold text-ink/60 uppercase tracking-wide">
        {label}{required && <span className="text-vermilion-500"> *</span>}
      </label>
      {textarea ? (
        <textarea
          required={required}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={2}
          className="mt-1.5 w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-vermilion-400"
        />
      ) : (
        <input
          required={required}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="mt-1.5 w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-vermilion-400"
        />
      )}
    </div>
  );
}
