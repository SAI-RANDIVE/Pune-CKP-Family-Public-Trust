import { Skeleton } from '../../../components/tms/ui';

/** Shown while a screen's figures are being fetched. Bilingual: this renders before the language is known. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <p style={{ fontWeight: 700, marginBottom: '1rem' }}>
        <span lang="mr">माहिती आणत आहे, कृपया थांबा…</span>{' '}
        <span lang="en" className="muted">Loading, please wait…</span>
      </p>
      <div className="tms-skel" style={{ height: '2.6rem', width: 'min(60%, 22rem)', marginBottom: '1.25rem' }} />
      <Skeleton lines={4} height="4.5rem" />
    </div>
  );
}
