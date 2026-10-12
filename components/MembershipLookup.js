'use client';

import { useState } from 'react';

const niceDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * First step of a renewal: the member types the ID on their card (new or old)
 * and the trust register answers with the tier, the validity and whether
 * anything needs paying. This is what stops a membership being entered or
 * paid for twice.
 *
 * value / onChange: the ID text.  onResult(result | null): what the register said.
 */
export default function MembershipLookup({ value, onChange, onResult, result }) {
  const [checking, setChecking] = useState(false);

  async function check() {
    const id = String(value || '').trim();
    if (id.length < 3) {
      onResult({ found: false, message: 'Please type your membership ID.' });
      return;
    }
    setChecking(true);
    try {
      const res = await fetch(`/api/membership/lookup?id=${encodeURIComponent(id)}`);
      onResult(await res.json());
    } catch {
      onResult({ found: false, message: 'The check is not working just now. Please try again in a moment.' });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="rounded-2xl border border-saffron-200 bg-white p-5">
      <label htmlFor="membership-id" className="text-xs font-semibold uppercase tracking-wide text-ink/60">
        Your membership ID<span className="text-vermilion-500"> *</span>
      </label>
      <div className="mt-1.5 flex flex-col gap-3 sm:flex-row">
        <input
          id="membership-id" required value={value} autoCapitalize="characters" spellCheck={false} maxLength={40}
          onChange={(e) => { onChange(e.target.value); onResult(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } }}
          placeholder="e.g. SLV/MEM/0012 or SM/24/173"
          className="w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-vermilion-400"
        />
        <button type="button" onClick={check} disabled={checking} className="btn btn-outline shrink-0 disabled:opacity-60">
          {checking ? 'Checking…' : 'Check my membership'}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink/60">
        The ID is on your receipt or membership card. Old numbers work too. Checking first makes sure nobody pays twice.
      </p>

      <div aria-live="polite">
        {result && !result.found && (
          <p className="mt-3 rounded-lg bg-vermilion-50 px-4 py-2.5 text-sm text-vermilion-700">{result.message}</p>
        )}
        {result?.found && (
          <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${result.canRenew ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-saffron-300 bg-saffron-50 text-ink'}`}>
            <p className="font-semibold">
              {result.name} · {result.tierLabel} · <span className="font-mono">{result.membershipId}</span>
            </p>
            <p className="mt-1">
              {result.validTill ? `Valid until ${niceDate(result.validTill)}.` : 'No expiry date on record.'}
              {result.canRenew && result.renewal?.validTill ? ` After renewal: valid until ${niceDate(result.renewal.validTill)}.` : ''}
            </p>
            {!result.canRenew && <p className="mt-1 font-medium">{result.message}</p>}
            {result.canRenew && <p className="mt-1">Use the e-mail address or mobile number you gave the trust, so we know it is you.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
