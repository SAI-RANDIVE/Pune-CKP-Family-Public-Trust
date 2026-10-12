'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The member's profile picture with "change" and "remove". The chosen photo is
 * cropped to a square from its centre and shrunk to 480px in the browser, so
 * what is uploaded is small whatever the phone's camera produced.
 */
async function squareJpeg(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 480;
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 480, 480);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
}

export default function ProfilePhoto({ hasPhoto, name }) {
  const router = useRouter();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stamp, setStamp] = useState(0);
  const [present, setPresent] = useState(hasPhoto);

  async function choose(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.set('file', await squareJpeg(file));
      const res = await fetch('/api/member/photo', { method: 'POST', body, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'The picture could not be saved.');
      setPresent(true);
      setStamp(Date.now());
      router.refresh();
    } catch (err) {
      setError(err.message || 'That file could not be used. Please choose a JPG or PNG photo.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    await fetch('/api/member/photo', { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
    setPresent(false);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      {present ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/member/photo?v=${stamp}`} alt={`Photograph of ${name}`} className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-lift" />
      ) : (
        <span aria-hidden="true" className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-saffron-100 font-display text-4xl text-vermilion-700 shadow-lift">
          {String(name || '?').charAt(0)}
        </span>
      )}
      <div>
        <input ref={input} id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={choose} />
        <div className="flex flex-wrap gap-3">
          <label htmlFor="profile-photo" className={`btn btn-sm btn-outline cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            {busy ? 'Saving…' : present ? 'Change my photo' : 'Add my photo'}
          </label>
          {present && !busy && <button type="button" onClick={remove} className="text-sm font-semibold text-ink/60 underline underline-offset-4">Remove</button>}
        </div>
        <p className="mt-2 text-xs text-ink/60">Seen only by you, your linked family and the trust office.</p>
        {error && <p role="alert" className="mt-2 text-sm text-vermilion-700">{error}</p>}
      </div>
    </div>
  );
}
