'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/import', label: 'Importer' },
  { href: '/transactions', label: 'Cessions' },
  { href: '/cerfa', label: 'Cerfa' },
  { href: '/aide', label: 'Aide' },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur-md print:hidden">
      <nav
        aria-label="Navigation principale"
        className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3.5"
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900 transition hover:text-teal-700"
        >
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center rounded-lg bg-teal-600 text-xs font-bold text-white"
          >
            €
          </span>
          crypto-tax-fr
        </Link>

        <div className="flex flex-wrap items-center gap-1 text-sm font-medium">
          {NAV_LINKS.map((link) => {
            // `startsWith` conserve l'état actif sur les sous-routes éventuelles
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 transition ${
                  active
                    ? 'bg-teal-50 text-teal-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
