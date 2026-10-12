'use client';

import { useEffect, useState } from 'react';

/**
 * "Install the app" button. Registers the service worker, then:
 *  - on Android and desktop Chrome / Edge, the browser tells us when the site
 *    can be installed and the button opens its own install prompt;
 *  - on an iPhone or iPad, which has no such prompt, the button shows the two
 *    taps that do the same thing (Share, then "Add to Home Screen");
 *  - when the site is already running as an installed app, nothing is shown.
 *
 * `variant`: 'button' (default) or 'link' for the footer.
 */
export default function InstallApp({ variant = 'button', className = '' }) {
  const [prompt, setPrompt] = useState(null);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* the site works without it */ });
    }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone) { setInstalled(true); return undefined; }
    const ua = window.navigator.userAgent;
    setIos(/iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document));

    const onPrompt = (event) => { event.preventDefault(); setPrompt(event); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || (!prompt && !ios)) return null;

  const install = async () => {
    if (prompt) {
      prompt.prompt();
      await prompt.userChoice.catch(() => null);
      setPrompt(null);
    } else {
      setHelp((v) => !v);
    }
  };

  const base = variant === 'link'
    ? 'link-underline text-left font-semibold'
    : 'btn btn-outline';
  return (
    <span className={`inline-block ${className}`}>
      <button type="button" onClick={install} className={base} aria-expanded={ios ? help : undefined}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 20h14" /></svg>
        Install the app
      </button>
      {help && (
        <span role="status" className="mt-2 block max-w-xs rounded-xl border border-saffron-300 bg-white p-3 text-left text-sm leading-relaxed text-ink shadow-soft">
          On an iPhone or iPad: tap the <strong>Share</strong> button at the bottom of Safari, then <strong>Add to Home Screen</strong>.
        </span>
      )}
    </span>
  );
}
