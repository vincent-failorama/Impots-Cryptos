import type { Metadata } from "next";
import Link from "next/link";
import { ReactNode } from "react";
import "./globals.css";

const NAV_LINKS = [
  { href: '/import', label: 'Importer CSV' },
  { href: '/transactions', label: 'Cessions' },
  { href: '/cerfa', label: 'Cerfa' },
  { href: '/aide', label: 'Aide' },
];

export const metadata: Metadata = {
  title: "crypto-tax-fr",
  description: "Outil personnel de calcul d'impôt crypto français et génération Cerfa.",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
            <Link href="/" className="text-base font-semibold text-teal-600 hover:text-teal-700">
              crypto-tax-fr
            </Link>
            <div className="flex gap-4 text-sm font-medium text-slate-600">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-slate-900">
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
