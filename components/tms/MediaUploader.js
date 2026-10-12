'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './icons';
import { useI18n } from './I18n';

const MAX_SIDE = { banner: 1920, photo: 1600 };
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Shrinks a picture in the browser before it is sent: a phone photo of 6 MB
 * becomes a few hundred kilobytes, which uploads quickly on a mobile
 * connection and loads quickly for visitors. Falls back to the original file
 * if the browser cannot decode it (the server still checks the type and size).
 */
async function shrink(file, maxSide) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

/** Adds a banner or photographs to an event. Several photographs may be chosen at once. */
export default function MediaUploader({ eventId, kind = 'photo' }) {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef(null);
  const [caption, setCaption] = useState('');
  const [state, setState] = useState({ busy: false, done: 0, total: 0, error: '', ok: false });

  async function upload(event) {
    event.preventDefault();
    const files = [...(input.current?.files || [])].slice(0, kind === 'banner' ? 1 : 20);
    if (!files.length) {
      setState((s) => ({ ...s, error: t('x.md.choose_first'), ok: false }));
      return;
    }
    setState({ busy: true, done: 0, total: files.length, error: '', ok: false });
    let failed = '';
    for (let i = 0; i < files.length; i += 1) {
      const file = await shrink(files[i], MAX_SIDE[kind]);
      if (file.size > MAX_BYTES) { failed = t('err.file_big'); continue; }
      const body = new FormData();
      body.set('file', file);
      body.set('kind', kind);
      if (caption.trim()) body.set('caption', caption.trim());
      const res = await fetch(`/api/tms/events/${eventId}/media`, { method: 'POST', body, credentials: 'same-origin' }).catch(() => null);
      if (!res || !res.ok) {
        const data = res ? await res.json().catch(() => ({})) : {};
        failed = t(`err.${data.error || 'server'}`);
      }
      setState((s) => ({ ...s, done: i + 1 }));
    }
    if (input.current) input.current.value = '';
    setCaption('');
    setState({ busy: false, done: 0, total: 0, error: failed, ok: !failed });
    router.refresh();
  }

  const id = `media-${kind}`;
  return (
    <form onSubmit={upload} className="no-print">
      <div className="tms-field">
        <label className="tms-label" htmlFor={id}>{kind === 'banner' ? t('x.md.banner_file') : t('x.md.photo_files')}</label>
        <input ref={input} id={id} className="tms-input" type="file" accept="image/jpeg,image/png,image/webp" multiple={kind !== 'banner'} />
        <span className="tms-hint">{kind === 'banner' ? t('x.md.banner_hint') : t('x.md.photo_hint')}</span>
      </div>
      {kind !== 'banner' && (
        <div className="tms-field">
          <label className="tms-label" htmlFor={`${id}-caption`}>{t('x.md.caption')} <span className="opt">({t('c.optional')})</span></label>
          <input id={`${id}-caption`} className="tms-input" value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} />
        </div>
      )}
      <button type="submit" className="tms-btn" disabled={state.busy} aria-busy={state.busy}>
        <Icon name="plus" />
        {state.busy ? t('x.md.uploading', { done: state.done, total: state.total }) : (kind === 'banner' ? t('x.md.add_banner') : t('x.md.add_photos'))}
      </button>
      <p aria-live="polite" style={{ marginTop: '0.5rem' }}>
        {state.error && <span className="tms-error">{state.error}</span>}
        {state.ok && <span className="tms-hint">{t('x.md.added')}</span>}
      </p>
    </form>
  );
}
