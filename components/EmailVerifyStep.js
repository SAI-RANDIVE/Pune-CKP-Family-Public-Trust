'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Email OTP step. Sits between "fill in the form" and "pay".
 *
 * Calls `onVerified(token)` once the code checks out. The parent passes that
 * token to /api/razorpay/create-order, which refuses to create an order
 * without it — so an unverified email can never reach checkout.
 */
export default function EmailVerifyStep({ email, verified, onVerified, onReset, disabled }) {
  const [stage, setStage] = useState('idle'); // idle | sending | sent | verifying
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // If the user edits the email after verifying, the old token is invalid.
  useEffect(() => {
    if (verified) onReset?.();
    setStage('idle');
    setCode('');
    setError('');
    setNotice('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  async function sendCode() {
    setError('');
    setNotice('');
    setStage('sending');
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send the code.');
      setStage('sent');
      setCooldown(45);
      setNotice(`We've sent a 6-digit code to ${email}. It expires in ${data.expiresInMinutes} minutes.`);
      setTimeout(() => inputRef.current?.focus(), 80);
    } catch (err) {
      setError(err.message);
      setStage('idle');
    }
  }

  async function submitCode(e) {
    // This component is rendered INSIDE the payment <form>, so it must never
    // contain a <form> of its own — nested forms are invalid HTML and the
    // browser breaks out of them, turning "Verify" into a real page navigation
    // that reloads the page and loses the whole checkout state.
    e?.preventDefault();
    setError('');
    setStage('verifying');
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'That code is not correct.');
      onVerified(data.token);
      setNotice('');
    } catch (err) {
      setError(err.message);
      setStage('sent');
    }
  }

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email || '');

  if (verified) {
    return (
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 p-5 flex items-start gap-3 reveal-pop">
        <span aria-hidden="true" className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white">✓</span>
        <div>
          <p className="text-sm font-semibold text-emerald-800">Email verified</p>
          <p className="text-xs text-emerald-700/80 mt-1 break-all">{email} — your receipt will be sent here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-saffron-300 bg-saffron-50/50 p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-saffron-400 text-xs font-bold text-ink">1</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">Verify your email before paying</p>
          <p className="text-xs text-ink/60 mt-1">
            Your receipt is issued against this address, so we confirm it first. This also
            registers your record permanently against the payment.
          </p>

          {stage !== 'sent' && stage !== 'verifying' && (
            <button
              type="button"
              onClick={sendCode}
              disabled={!emailLooksValid || disabled || stage === 'sending'}
              className="btn-press mt-4 rounded-full bg-vermilion-500 px-5 py-2.5 text-sm font-semibold text-cream-100 hover:bg-vermilion-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {stage === 'sending' ? 'Sending code…' : 'Send verification code'}
            </button>
          )}

          {!emailLooksValid && stage === 'idle' && (
            <p className="text-xs text-ink/50 mt-2">Enter your email address above first.</p>
          )}

          {(stage === 'sent' || stage === 'verifying') && (
            // Deliberately a <div>, not a <form> — see submitCode().
            <div className="mt-4">
              <label htmlFor="otp-code" className="text-xs font-semibold uppercase tracking-wide text-ink/60">
                6-digit code
              </label>
              <div className="flex flex-wrap gap-2 mt-2">
                <input
                  id="otp-code"
                  ref={inputRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => {
                    // Enter should verify, not submit the surrounding payment form.
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    if (code.length === 6 && stage !== 'verifying') submitCode();
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  placeholder="000000"
                  className="w-40 rounded-xl border-2 border-saffron-300 bg-white px-4 py-2.5 text-center font-mono text-lg tracking-[0.4em] focus:border-vermilion-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={submitCode}
                  disabled={code.length !== 6 || stage === 'verifying'}
                  className="btn-press rounded-full bg-vermilion-500 px-5 py-2.5 text-sm font-semibold text-cream-100 hover:bg-vermilion-600 disabled:opacity-50"
                >
                  {stage === 'verifying' ? 'Checking…' : 'Verify'}
                </button>
              </div>
              <button
                type="button"
                onClick={sendCode}
                disabled={cooldown > 0}
                className="mt-3 text-xs font-semibold text-vermilion-600 hover:text-vermilion-700 disabled:text-ink/40 link-underline"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          )}

          {notice && <p className="mt-3 text-xs text-ink/70">{notice}</p>}
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-vermilion-50 px-3 py-2 text-xs text-vermilion-700">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
