'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import Icon from './icons';
import { useI18n } from './I18n';
import { amountInWords } from '../../lib/tms/format';

/** "Back": the previous screen, or the home page when there is none. */
export function BackButton({ label }) {
  const router = useRouter();
  return (
    <button
      type="button" className="tms-btn tms-btn--secondary"
      onClick={() => { if (window.history.length > 1) router.back(); else router.push('/'); }}
    >
      <Icon name="back" />{label}
    </button>
  );
}

export function PrintButton({ label }) {
  return (
    <button type="button" className="tms-btn tms-btn--secondary no-print" onClick={() => window.print()}>
      <Icon name="print" />{label}
    </button>
  );
}

/** Submit button that says it is working and cannot be pressed twice. */
export function SubmitButton({ children, className = 'tms-btn', busyLabel, ...rest }) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending} {...rest}>
      {pending ? (busyLabel || t('c.saving')) : children}
    </button>
  );
}

/**
 * A submit button that first asks "are you sure?" in a dialog. Place it inside
 * the <form> it should submit. `name`/`value` are sent with the form, so one
 * form can carry several different confirmed actions.
 */
export function ConfirmSubmit({ label, title, message, yes, className = 'tms-btn tms-btn--danger', name, value, icon }) {
  const { t } = useI18n();
  const titleId = useId();
  const dialog = useRef(null);
  const trigger = useRef(null);
  const [busy, setBusy] = useState(false);

  const confirm = () => {
    const form = trigger.current?.form;
    dialog.current?.close();
    if (!form) return;
    // A missing required field (a reason, a note) is pointed out by the browser first.
    if (!form.reportValidity()) return;
    setBusy(true);
    if (name) {
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = name;
      hidden.value = value ?? '';
      form.appendChild(hidden);
    }
    form.requestSubmit();
  };

  return (
    <>
      <button ref={trigger} type="button" className={className} disabled={busy} onClick={() => dialog.current?.showModal()}>
        {icon && <Icon name={icon} />}{busy ? t('c.saving') : label}
      </button>
      <dialog ref={dialog} className="tms-dialog" aria-labelledby={titleId}>
        <h2 id={titleId}>{title || t('c.sure')}</h2>
        <p>{message}</p>
        <div className="tms-actions">
          <button type="button" className="tms-btn tms-btn--quiet" onClick={() => dialog.current?.close()} autoFocus>{t('c.no_back')}</button>
          <button type="button" className={className} onClick={confirm}>{yes || t('c.yes_do')}</button>
        </div>
      </dialog>
    </>
  );
}

/** Rupee amount with the amount in words (Marathi and English) underneath. */
export function AmountInput({ id, name, value, defaultValue, onChange, invalid, placeholder = '5000', describedBy, required }) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? '');
  const shown = controlled ? value : inner;
  const words = amountInWords(String(shown).replace(/,/g, ''));
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span aria-hidden="true" style={{ fontSize: '1.8rem', fontWeight: 800 }}>₹</span>
        <input
          className="tms-input tms-input--amount" id={id} name={name} type="text" inputMode="decimal" autoComplete="off"
          value={shown} placeholder={placeholder} required={required} aria-invalid={invalid || undefined} aria-describedby={describedBy}
          onChange={(e) => {
            const next = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 13);
            if (!controlled) setInner(next);
            onChange?.(next);
          }}
        />
      </div>
      {words && (
        <div className="tms-words" aria-live="polite">
          <span lang="mr">{words.mr}</span>
          <span lang="en" className="muted">{words.en}</span>
        </div>
      )}
    </>
  );
}

/**
 * Plain-language warning before the session ends, with one button to stay
 * signed in. After expiry it says so and offers the sign-in page.
 */
export function SessionWarning({ expiresAt, extend }) {
  const { t } = useI18n();
  const [until, setUntil] = useState(() => new Date(expiresAt).getTime());
  const [now, setNow] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setUntil(new Date(expiresAt).getTime()); }, [expiresAt]);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (now === null) return null;
  const minutes = Math.ceil((until - now) / 60_000);
  if (minutes > 10) return null;

  if (minutes <= 0) {
    return (
      <div className="tms-session tms-alert tms-alert--error" role="alert">
        <Icon name="warn" />
        <div>
          <strong>{t('auth.expired_title')}</strong>
          {t('auth.expired_body')}{' '}
          <a href="/login">{t('auth.sign_in_again')}</a>
        </div>
      </div>
    );
  }
  return (
    <div className="tms-session tms-alert tms-alert--warn" role="alert">
      <Icon name="warn" />
      <div>
        <strong>{t('auth.expiring_title', { minutes })}</strong>
        {t('auth.expiring_body')}
        <div className="tms-actions" style={{ marginTop: '0.5rem' }}>
          <button
            type="button" className="tms-btn tms-btn--small" disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const next = await extend();
                if (next) setUntil(new Date(next).getTime());
              } finally { setBusy(false); }
            }}
          >
            {busy ? t('c.saving') : t('auth.stay')}
          </button>
        </div>
      </div>
    </div>
  );
}
