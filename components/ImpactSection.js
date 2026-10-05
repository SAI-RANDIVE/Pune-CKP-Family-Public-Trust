import { unstable_cache } from 'next/cache';
import CountUp from './CountUp';
import SectionHeading from './SectionHeading';
import { Stagger } from './Reveal';
import AreaIcon from './AreaIcon';
import { getPool } from '../lib/db';
import { STATIC_IMPACT } from '../lib/impactData';

/**
 * "Our Impact" on the home page: aggregated totals only.
 *
 * Live figures come from the Postgres view v_public_impact (one row of
 * counts and sums; it exposes no names and no individual amounts). The read
 * is cached for an hour. If the database is not configured, is unreachable,
 * is slow, or the view does not exist yet, the section silently falls back
 * to the figures the trust published on its old site (lib/impactData.js).
 * It can never break the home page.
 */
const QUERY = `select active_members, donors, beneficiaries_supported, welfare_disbursed, events_held, years_of_service
               from v_public_impact`;

const readImpact = unstable_cache(
  async () => {
    const query = getPool().query(QUERY);
    query.catch(() => {}); // a late failure after the timeout must not become an unhandled rejection
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('v_public_impact timed out')), 5000); });
    try {
      const { rows } = await Promise.race([query, timeout]);
      const row = rows[0] || {};
      const number = (value) => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? n : 0;
      };
      return {
        activeMembers: number(row.active_members),
        donors: number(row.donors),
        beneficiaries: number(row.beneficiaries_supported),
        welfareDisbursed: Math.round(number(row.welfare_disbursed)),
        eventsHeld: number(row.events_held),
        yearsOfService: number(row.years_of_service),
      };
    } finally {
      clearTimeout(timer);
    }
  },
  ['public-impact-v1'],
  { revalidate: 3600 }
);

async function loadLiveTiles() {
  try {
    const live = await readImpact();
    const tiles = [
      live.welfareDisbursed && { key: 'welfare', icon: 'hands', value: live.welfareDisbursed, prefix: '₹', notation: live.welfareDisbursed >= 100000 ? 'lakh' : 'full', unit: live.welfareDisbursed >= 100000 ? 'lakh' : '', label: 'Welfare disbursed', note: 'Through the trust’s schemes' },
      live.beneficiaries && { key: 'beneficiaries', icon: 'heart', value: live.beneficiaries, label: 'Beneficiaries supported', note: 'People reached by scheme disbursements' },
      live.activeMembers && { key: 'members', icon: 'users', value: live.activeMembers, label: 'Active members', note: 'Silver, Gold and Platinum' },
      live.donors && { key: 'donors', icon: 'medal', value: live.donors, label: 'Donors', note: 'People who have given to the trust' },
      live.eventsHeld && { key: 'events', icon: 'calendar', value: live.eventsHeld, label: 'Events held', note: 'Camps, programmes and ceremonies' },
    ].filter(Boolean);

    // A nearly empty database says nothing useful: prefer the published figures.
    if (tiles.length < 2) return null;
    if (live.yearsOfService) tiles.push({ key: 'years', icon: 'leaf', value: live.yearsOfService, label: 'Years of service as a trust', note: 'Registered on 14 May 2018' });
    return tiles;
  } catch (error) {
    return null;
  }
}

const STATIC_ICONS = { contributed: 'hands', years: 'leaf', sohala: 'medal', families: 'heart' };

export default async function ImpactSection() {
  const live = await loadLiveTiles();
  const tiles = live || STATIC_IMPACT.map((item) => ({ ...item, icon: STATIC_ICONS[item.key] }));
  const columns = tiles.length >= 6 ? 'lg:grid-cols-6' : tiles.length === 5 ? 'lg:grid-cols-5' : tiles.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4';

  return (
    <section className="on-dark panel-ink relative overflow-hidden" aria-labelledby="impact-heading">
      <div className="motif-paithani" aria-hidden="true" />
      <div className="motif-rangoli-light pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="container-page section-y relative">
        <SectionHeading
          light
          id="impact-heading"
          eyebrow="Our Impact"
          title="What giving back adds up to"
          intro={live
            ? 'Totals from the trust’s own records, refreshed every hour.'
            : 'Figures the trust has published about its work since it began.'}
        />

        <Stagger as="ul" className={`mt-12 grid grid-cols-2 gap-4 sm:gap-5 ${columns}`}>
          {tiles.map((tile) => (
            <li key={tile.key} className="rounded-2xl border border-saffron-400/25 bg-white/[0.06] p-5 text-center backdrop-blur-sm sm:p-6">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-saffron-400/15 text-saffron-300">
                <AreaIcon name={tile.icon} className="h-5 w-5" />
              </span>
              <p className="mt-4 font-display text-[1.7rem] leading-none text-saffron-300 sm:text-4xl">
                <CountUp value={tile.value} prefix={tile.prefix || ''} suffix={tile.suffix || ''} notation={tile.notation || 'full'} />
                {tile.unit && <span className="mt-1 block font-body text-sm font-semibold tracking-wide text-saffron-200">{tile.unit}</span>}
              </p>
              <p className="mt-3 text-sm font-semibold text-white">{tile.label}</p>
              {tile.note && <p className="mt-1 text-xs leading-relaxed text-cream-200/75">{tile.note}</p>}
            </li>
          ))}
        </Stagger>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-cream-200/70">
          Totals only. No member, donor or beneficiary is ever named, and no individual amount is shown.
        </p>
      </div>
      <div className="motif-paithani" aria-hidden="true" />
    </section>
  );
}
