'use client';

import { useState } from 'react';
import EmailVerifyStep from './EmailVerifyStep';

const QUICK_AMOUNTS = [251, 501, 1001, 2501, 5001];

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

export default function DonationForm() {
  const [amount, setAmount] = useState(1001);
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', address: '' });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [verificationToken, setVerificationToken] = useState(null);

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
          kind: 'donation',
          amount,
          verificationToken,
          payer: { name: form.fullName, phone: form.phone, email: form.email, address: form.address },
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
        modal: { ondismiss: () => setStatus('idle') },
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
        <h2 className="font-display text-2xl mt-6 text-vermilion-700">Thank you for your generosity!</h2>
        <p className="text-sm text-ink/70 mt-2">Receipt No. <span className="font-mono font-semibold">{receipt.receiptNo}</span></p>
        {receipt.membershipNo && (
          <p className="text-sm text-ink/70 mt-1">Membership No. <span className="font-mono font-semibold text-vermilion-700">{receipt.membershipNo}</span></p>
        )}
        <p className="text-xs text-ink/60 mt-4 leading-relaxed">A copy of this receipt has been emailed to you. Keep it for your records.</p>
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
    <form onSubmit={handleSubmit} className="max-w-xl mx-auto bg-cream-100 border border-saffron-200 rounded-3xl p-8 md:p-10 space-y-6">
      <div>
        <label className="text-xs font-semibold text-ink/60 uppercase tracking-wide">Amount (₹100 – ₹10,000)</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {QUICK_AMOUNTS.map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => setAmount(a)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border-2 ${amount === a ? 'border-vermilion-500 bg-vermilion-50 text-vermilion-700' : 'border-saffron-200 text-ink/60'}`}
            >
              ₹{a}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={100}
          max={10000}
          required
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="mt-3 w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-vermilion-400"
        />
        <p className="text-xs text-ink/50 mt-1.5">
          Want to give more than ₹10,000? Please use the bank transfer details in the footer —
          we&apos;ll email you an official receipt directly.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Full Name" required value={form.fullName} onChange={update('fullName')} />
        <Field label="Phone Number" required type="tel" value={form.phone} onChange={update('phone')} />
      </div>
      <Field label="Email ID" required type="email" value={form.email} onChange={update('email')} />
      <Field label="Address" required value={form.address} onChange={update('address')} textarea />

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
        disabled={status === 'processing' || !verificationToken}
        className="btn-press w-full rounded-full bg-vermilion-500 text-cream-100 px-7 py-3.5 font-semibold hover:bg-vermilion-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'processing' ? 'Opening secure checkout…' : !verificationToken ? 'Verify your email to continue' : `Donate ₹${amount || 0}`}
      </button>
    </form>
  );
}

function Field({ label, required, type = 'text', value, onChange, textarea }) {
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
          rows={2}
          className="mt-1.5 w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-vermilion-400"
        />
      ) : (
        <input
          required={required}
          type={type}
          value={value}
          onChange={onChange}
          className="mt-1.5 w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-vermilion-400"
        />
      )}
    </div>
  );
}
