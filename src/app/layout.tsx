import type { Metadata } from "next";
import { ReactNode } from "react";
import { NavBar } from "./nav-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "crypto-tax-fr",
    template: "%s · crypto-tax-fr",
  },
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
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-teal-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Aller au contenu
        </a>

        <NavBar />

        <div id="contenu" className="flex-1">
          {children}
        </div>

        <footer className="border-t border-slate-200 bg-white print:hidden">
          <div className="mx-auto max-w-6xl px-6 py-6 text-xs leading-relaxed text-slate-500">
            <p>
              <strong className="font-semibold text-slate-700">Aide à la déclaration — pas un conseil fiscal.</strong>{" "}
              Les montants sont calculés selon l&apos;article 150 VH bis du CGI à partir des données que vous importez.
              Vérifiez-les avec vos relevés avant toute déclaration, et consultez un professionnel en cas de doute.
            </p>
            <p className="mt-2">
              Traitement 100 % local · seuls les prix historiques sont récupérés auprès de l&apos;API publique CoinGecko.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
