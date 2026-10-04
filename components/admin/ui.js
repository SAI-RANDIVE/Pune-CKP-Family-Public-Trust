import { BadgeChip } from '../MembershipBadge';

export function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function formatDate(value, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d);
}

const STATUS_STYLES = {
  paid: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  created: 'bg-amber-100 text-amber-700 ring-amber-200',
  failed: 'bg-red-100 text-red-700 ring-red-200',
  refunded: 'bg-slate-200 text-slate-700 ring-slate-300',
  partially_refunded: 'bg-slate-200 text-slate-700 ring-slate-300',
};

export function StatusPill({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
      {String(status || '').replace('_', ' ')}
    </span>
  );
}

export { BadgeChip };

export function StatCard({ label, value, note, accent = false }) {
  return (
    <div className={`soft-card rounded-2xl border p-5 ${accent ? 'border-[#c96b2b]/40 bg-gradient-to-br from-[#fffaf3] to-[#fdeedd]' : 'border-[#ead8be] bg-white'}`}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export function EmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-slate-500">{children}</td>
    </tr>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="mb-7 flex flex-col gap-4 border-b border-[#ead7c2] pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c96b2b]">{subtitle}</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-900">{title}</h2>
      </div>
      {children}
    </header>
  );
}
