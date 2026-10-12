'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './icons';

/**
 * The side menu of the management system (wide screens) and the same list as
 * a slide-down menu on phones. Sections arrive already filtered by what this
 * login may open, grouped under short headings, and already translated.
 *
 * groups: [{ title, items: [{ href, icon, label, badge }] }]
 */
export default function SideNav({ groups }) {
  const pathname = usePathname() || '/';
  const isActive = (href) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav className="tms-side-nav" aria-label="Sections">
      {groups.map((group) => (
        <div key={group.title} className="grp">
          <p className="ttl">{group.title}</p>
          <ul>
            {group.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
                  <Icon name={item.icon} size="1.25em" />
                  <span>{item.label}</span>
                  {item.badge ? <b className="bdg">{item.badge}</b> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
