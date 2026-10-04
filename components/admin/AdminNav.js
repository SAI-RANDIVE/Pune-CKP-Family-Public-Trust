'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { label: 'Overview', href: '/admin', exact: true },
  { label: 'Payments', href: '/admin/payments' },
  { label: 'Members', href: '/admin/members' },
  { label: 'Email & OTP', href: '/admin/emails', minRole: 'accountant' },
  { label: 'Audit log', href: '/admin/audit', minRole: 'admin' },
];

const RANK = { viewer: 0, accountant: 1, admin: 2, super_admin: 3 };

export default function AdminNav({ role }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="space-y-1.5">
      {ITEMS.filter((i) => !i.minRole || (RANK[role] ?? -1) >= RANK[i.minRole]).map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
              active
                ? 'bg-[#f7efe4] text-[#8f4f1d] shadow-sm ring-1 ring-[#ead6b7]'
                : 'text-slate-600 hover:bg-[#f7f1ea] hover:text-slate-900 hover:translate-x-0.5'
            }`}
          >
            <span>{item.label}</span>
            <span aria-hidden="true" className={`text-xs transition-transform ${active ? 'text-[#c96b2b] translate-x-0' : 'text-slate-400'}`}>→</span>
          </Link>
        );
      })}
    </nav>
  );
}
