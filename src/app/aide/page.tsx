'use client';

import React, { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';

type Step = { num: number; title: string; body: ReactNode };

function StepCard({ num, title, body }: Step) {
  return (
    <div className="flex gap-5">
      <div className="shrink-0 w-9 h-9 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-sm">
        {num}
      </div>
      <div className="pt-1">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <div className="mt-1 text-slate-600 text-sm leading-relaxed">{body}</div>
      </div>
    </div>
  );
}

type PlatformExport = {
  name: string;
  steps: string[];
  note?: string;
};

const platformExports: PlatformExport[] = [
  {
    name: 'Binance',
    steps: [
      'Méthode recommandée : utilisez l\'onglet "Binance — API" dans la page Importer pour récupérer tout l\'historique en une seule opération (sans limite de 6 mois).',
      'Méthode CSV (limitée à 6 mois) : Connectez-vous sur binance.com → Portefeuille → Historique des transactions → Exporter → Type "Transactions spot" → Générer.',
      'Pour un historique complet via CSV : exportez période par période (6 mois à la fois) et importez chaque fichier séparément.',
    ],
    note: 'L\'export CSV Binance est limité à 6 mois par fichier. Préférez la connexion API (lecture seule) pour obtenir l\'historique complet en une fois.',
  },
  {
    name: 'Bitget',
    steps: [
      'Connectez-vous sur bitget.com',
      'Actifs → Historique des ordres → Spot',
      'Filtrez par date → Exporter',
      'Téléchargez le fichier CSV reçu par e-mail ou disponible directement',
    ],
  },
  {
    name: 'Kraken',
    steps: [
      'Connectez-vous sur kraken.com',
      'Historique → Exporter',
      'Type d\'export : "Trades"',
      'Sélectionnez la période → Soumettre → Télécharger',
    ],
    note: 'Choisissez "Trades" et non "Ledgers" pour avoir les données correctes.',
  },
  {
    name: 'Gate.io',
    steps: [
      'Connectez-vous sur gate.io',
      'Ordres → Historique des ordres au comptant',
      'Cliquez sur "Exporter" en haut à droite',
      'Choisissez la plage de dates → Télécharger CSV',
    ],
  },
  {
    name: 'KuCoin',
    steps: [
      'Connectez-vous sur kucoin.com',
      'Actifs → Historique des ordres → Ordres réalisés',
      'Cliquez sur "Exporter les données"',
      'Sélectionnez "Spot" et la plage de dates → Exporter',
      'Téléchargez le CSV (envoyé par e-mail ou disponible dans les exports)',
    ],
  },
  {
    name: 'Coinbase',
    steps: [
      'Connectez-vous sur coinbase.com',
      'Profil → Relevés (Statements)',
      'Onglet "Transactions" → Générer un relevé personnalisé',
      'Sélectionnez toutes les devises, la plage de dates → Télécharger CSV',
    ],
    note: 'Pour Coinbase Advanced Trade : Portefeuille → Historique → Exporter.',
  },
];

const quickLinks = [
  { href: '#workflow', label: 'Fonctionnement général' },
  { href: '#exports', label: 'Exporter depuis ma plateforme' },
  { href: '#api', label: 'Import via API' },
  { href: '#import', label: "Importer dans l'app" },
  { href: '#cessions', label: 'Lire les résultats' },
  { href: '#cerfa', label: 'Générer le Cerfa' },
  { href: '#loi', label: 'La loi en clair' },
];

const resultColumns = [
  { col: 'Produit', desc: 'Montant encaissé lors de la vente (en €).' },
  { col: 'Coût imputé', desc: 'Part du prix de revient global attribuée à cette cession selon la formule proportionnelle 150 VH bis. Ce n\'est pas le prix d\'achat de l\'actif vendu.' },
  { col: 'Gain / Perte', desc: 'Produit − Coût imputé. En vert si bénéficiaire, en rouge si déficitaire.' },
  { col: 'Val. portefeuille', desc: 'Valeur estimée de l\'ensemble du portefeuille crypto au moment de la cession, calculée à partir des derniers prix connus dans vos transactions. Cette valeur influence directement le calcul.' },
];

type CerfaSection = {
  id: string;
  title: string;
  intro: string;
  cases: { label: string; desc: ReactNode }[];
  outro?: ReactNode;
};

const loiTerms = [
  { term: 'Prix de cession', def: 'Montant reçu lors de la vente (en €), net de frais.' },
  { term: 'Prix de revient global', def: 'Somme de toutes vos acquisitions crypto depuis le début, diminuée au fur et à mesure de chaque cession. Ce n\'est pas le prix d\'achat du seul actif vendu.' },
  { term: 'Valeur globale du portefeuille', def: 'Valeur EUR de l\'ensemble de vos crypto-actifs au moment de la cession, sur toutes les plateformes confondues.' },
];

export default function AidePage() {
  const [showTopBtn, setShowTopBtn] = useState(false);

  // Les constantes contenant du JSX (comme <Link>) doivent être déclarées à l'intérieur du composant
  // pour éviter les erreurs d'hydratation ou d'accès au contexte du routeur Next.js au chargement.
  const workflowSteps: Omit<Step, 'num'>[] = [
    { title: "Exportez vos CSV depuis chaque plateforme", body: "Chaque exchange (Binance, Kraken, Coinbase…) vous permet de télécharger l'historique de vos ordres au format CSV. Vous aurez besoin de l'historique complet depuis votre première transaction crypto." },
    { title: "Importez-les dans l'application", body: <>Rendez-vous sur la page <Link href="/import" className="text-teal-600 underline">Importer CSV</Link>, sélectionnez la plateforme correspondante, puis choisissez le fichier. Répétez l&apos;opération pour chaque plateforme et chaque année.</> },
    { title: "Consultez vos cessions imposables", body: <>La page <Link href="/transactions" className="text-teal-600 underline">Cessions</Link> calcule automatiquement vos plus-values et moins-values selon la formule 150 VH bis.</> },
    { title: "Générez les formulaires Cerfa", body: <>La page <Link href="/cerfa" className="text-teal-600 underline">Cerfa</Link> vous permet de télécharger en PDF votre déclaration 2086 (plus-values) et 3916-bis (comptes à l&apos;étranger).</> },
  ];

  const apiPlatforms = [
    { name: 'Binance', desc: <>Profil → Gestion des clés API → Créer une clé API (Système généré). Activez <strong className="text-teal-700">uniquement &quot;Enable Reading&quot;</strong>.</> },
    { name: 'Kraken', desc: <>Sécurité → API → Créer une clé API. Cochez <strong className="text-teal-700">uniquement &quot;Query Funds&quot; et &quot;Query Closed Orders &amp; Trades&quot;</strong>.</> },
    { name: 'Coinbase', desc: <>Paramètres → API → Nouvelle clé API (Legacy). Activez <strong className="text-teal-700">uniquement la permission &quot;brokerage:orders:read&quot;</strong> (ou &quot;wallet:trades:read&quot;).</> },
    { name: 'Gate.io', desc: <>Gestion des API → Créer une clé APIv4. Activez <strong className="text-teal-700">uniquement &quot;Spot Trade&quot; en &quot;Read Only&quot;</strong>.</> },
    { name: 'KuCoin', desc: <>Gestion des API → Créer une API (Type : API Trading). Activez <strong className="text-teal-700">uniquement &quot;General&quot;</strong>. Vous devrez également renseigner la phrase secrète (Passphrase).</> },
  ];

  const apiSteps: Omit<Step, 'num'>[] = [
    { title: "Créer une clé API en lecture seule", body: <div className="space-y-4 mt-2">{apiPlatforms.map(p => <div key={p.name}><strong className="text-slate-900">{p.name} :</strong> {p.desc}</div>)}</div> },
    { title: "Importer dans l'application", body: <>Allez sur la page <Link href="/import" className="text-teal-600 underline">Importer</Link>, onglet <strong>Via API</strong>. Sélectionnez votre plateforme, collez votre clé et votre secret, puis cliquez sur le bouton de récupération. L&apos;opération peut prendre quelques instants selon le volume de votre historique.</> },
    { title: "Ce qui est récupéré", body: "Tous vos trades spot sur le compte de la plateforme. Les trades sur paires crypto/crypto sont également inclus et traités comme des événements imposables selon la règle du 150 VH bis." },
  ];

  const importSteps: Omit<Step, 'num'>[] = [
    { title: "Sélectionnez la plateforme", body: "Choisissez la plateforme qui correspond au fichier CSV que vous allez importer. Ce choix détermine comment le fichier est analysé." },
    { title: "Choisissez le fichier CSV", body: "Le fichier est analysé immédiatement dans votre navigateur. Aucune donnée n'est envoyée sur Internet — tout reste local." },
    { title: "Vérifiez le message de confirmation", body: 'L\'application indique combien de transactions ont été importées. Si "0 transaction trouvée", vérifiez que la plateforme sélectionnée correspond bien au fichier.' },
    { title: "Répétez pour chaque plateforme et chaque année", body: "Les transactions s'accumulent sans doublons : importer deux fois le même fichier ne crée pas de doublons." },
  ];

  const importTips = [
    <>Importez l&apos;historique <strong>complet</strong> depuis votre première transaction, pas seulement l&apos;année en cours. Le calcul 150 VH bis dépend du coût d&apos;acquisition cumulé depuis le début.</>,
    <>Si vous avez plusieurs comptes sur la même plateforme, exportez et importez chaque compte séparément.</>,
    <>Utilisez le bouton <em>Effacer toutes les transactions</em> uniquement pour repartir de zéro.</>,
  ];

  const cerfaSections: CerfaSection[] = [
    {
      id: '2086',
      title: 'Cerfa 2086 — Plus-values crypto',
      intro: 'Ce formulaire sert à déclarer vos plus-values et moins-values sur cessions d\'actifs numériques. Il est à joindre à votre déclaration de revenus (formulaire 2042-C).',
      cases: [
        { label: 'Case 3AN', desc: <>Saisissez votre plus-value nette de l&apos;année (si positive). Reportez cette valeur en case 3AN de la 2042-C.</> },
        { label: 'Case 3BN', desc: <>Saisissez votre moins-value nette (si négative). <span className="text-amber-700 font-medium">Non reportable sur les années suivantes.</span></> },
        { label: 'Case 3VH', desc: <>Total des prix de cession de l&apos;année (somme des colonnes &quot;Produit&quot;).</> },
      ],
    },
    {
      id: '3916',
      title: 'Cerfa 3916-bis — Comptes à l\'étranger',
      intro: 'Depuis 2020, vous devez déclarer chaque compte d\'actifs numériques détenu à l\'étranger, même si vous n\'avez pas effectué de transactions dans l\'année. Un formulaire par compte (ou par plateforme si vous n\'avez qu\'un compte par plateforme).',
      cases: [
        { label: 'Institution', desc: 'Nom de la plateforme (ex: Binance, KuCoin).' },
        { label: 'Pays', desc: 'Pays du siège social de la plateforme (ex: Malte pour Binance EU, Seychelles pour KuCoin).' },
        { label: 'Numéro de compte', desc: 'Votre UID utilisateur ou identifiant de compte sur la plateforme.' },
      ],
      outro: <>Cliquez sur <em>+ Ajouter un compte</em> pour déclarer plusieurs plateformes. L&apos;application génère un PDF séparé par compte.</>,
    }
  ];

  const loiPoints = [
    <>Les <strong>moins-values ne sont pas reportables</strong> sur les années suivantes.</>,
    <>Les échanges crypto→crypto (<em>trades</em>) sont des <strong>événements taxables</strong> au même titre que les ventes en euros.</>,
    <>Les <strong>comptes à l&apos;étranger</strong> doivent être déclarés chaque année via le 3916-bis, même sans activité.</>,
    <>Le <strong>staking, mining et airdrop</strong> peuvent générer des revenus imposables dans une autre catégorie (BNC). Cette application ne les calcule pas.</>,
  ];

  useEffect(() => {
    const handleScroll = () => {
      setShowTopBtn(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-10">

        {/* En-tête */}
        <section className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
          <h1 className="text-3xl font-semibold text-slate-900">Guide d&apos;utilisation</h1>
          <p className="mt-3 text-slate-600">
            crypto-tax-fr calcule vos plus-values sur actifs numériques selon la méthode
            proportionnelle de l&apos;article 150 VH bis du CGI et vous aide à préparer votre
            déclaration annuelle.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            {quickLinks.map((link) => (
              <a key={link.href} href={link.href} className="rounded-xl bg-teal-50 px-4 py-2 text-teal-700 hover:bg-teal-100">
                {link.label}
              </a>
            ))}
          </div>
        </section>

        {/* Fonctionnement général */}
        <section id="workflow" className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">Fonctionnement général</h2>
          <div className="space-y-6">
            {workflowSteps.map((step, i) => (
              <StepCard key={i} num={i + 1} title={step.title} body={step.body} />
            ))}
          </div>
        </section>

        {/* Exports par plateforme */}
        <section id="exports" className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">Comment exporter depuis ma plateforme</h2>
          <div className="space-y-8">
            {platformExports.map((platform) => (
              <div key={platform.name}>
                <h3 className="font-semibold text-slate-900 mb-3">{platform.name}</h3>
                <ol className="space-y-2">
                  {platform.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-slate-600">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-medium">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
                {platform.note && (
                  <p className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-800">
                    {platform.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Import via API */}
        <section id="api" className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Connexion via API (Binance, Kraken, Coinbase, Gate.io, KuCoin)</h2>
          <p className="text-sm text-slate-600 mb-6">
            L&apos;import via API permet de récupérer l&apos;intégralité de votre historique en une seule opération, contournant les limitations des exports CSV (comme la limite de 6 mois sur Binance).
          </p>
          <div className="space-y-6">
            {apiSteps.map((step, i) => (
              <StepCard key={i} num={i + 1} title={step.title} body={step.body} />
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-1">
            <p className="font-semibold">Votre clé API est-elle en sécurité ?</p>
            <p>
              Oui. La clé transite uniquement entre votre navigateur et votre serveur local (localhost).
              Elle n&apos;est jamais stockée sur disque ni envoyée à un service tiers.
              Une fois la requête terminée, elle est oubliée.
            </p>
            <p>
              En lecture seule, la clé ne peut pas déclencher de transactions ni de retraits,
              même si elle était interceptée.
            </p>
          </div>
        </section>

        {/* Import */}
        <section id="import" className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">Importer dans l&apos;application</h2>
          <div className="space-y-6">
            {importSteps.map((step, i) => (
              <StepCard key={i} num={i + 1} title={step.title} body={step.body} />
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700 space-y-2">
            <p className="font-semibold text-slate-900">Conseils</p>
            {importTips.map((tip, i) => (
              <p key={i}>• {tip}</p>
            ))}
          </div>
        </section>

        {/* Lire les résultats */}
        <section id="cessions" className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Lire les résultats</h2>
          <p className="text-sm text-slate-600 mb-6">
            La page <Link href="/transactions" className="text-teal-600 underline">Cessions</Link> affiche
            chaque cession imposable avec les colonnes suivantes :
          </p>
          <div className="space-y-4">
            {resultColumns.map(({ col, desc }) => (
              <div key={col} className="flex gap-4 text-sm">
                <span className="shrink-0 w-36 font-semibold text-slate-900">{col}</span>
                <span className="text-slate-600">{desc}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            <strong>Attention :</strong> la colonne <em>Val. portefeuille</em> est une <strong>estimation</strong> basée
            sur les prix présents dans vos CSV. Si vous avez des actifs détenus sur des portefeuilles
            non importés, ou si les prix EUR ne figurent pas dans vos exports, la valeur sera sous-estimée,
            ce qui peut surévaluer votre plus-value. Dans ce cas, corrigez manuellement les cases du Cerfa.
          </div>
        </section>

        {/* Cerfa */}
        <section id="cerfa" className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">Générer les formulaires Cerfa</h2>

          <div className="space-y-8">
            {cerfaSections.map((section) => (
              <div key={section.id}>
                <h3 className="font-semibold text-slate-900 mb-3">{section.title}</h3>
                <div className="space-y-3 text-sm text-slate-600">
                  <p>{section.intro}</p>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
                    {section.cases.map((c) => (
                      <p key={c.label}><strong className="text-slate-900">{c.label}</strong> — {c.desc}</p>
                    ))}
                  </div>
                  {section.outro && <p>{section.outro}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* La loi en clair */}
        <section id="loi" className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">La loi en clair (article 150 VH bis)</h2>
          <div className="space-y-4 text-sm text-slate-600">
            <p>
              En France, les plus-values sur cessions d&apos;actifs numériques sont imposées au taux
              forfaitaire de <strong className="text-slate-900">30 %</strong> (12,8 % IR + 17,2 % prélèvements sociaux),
              sauf option pour le barème progressif.
            </p>

            <div className="rounded-2xl bg-slate-900 text-slate-100 px-6 py-5 font-mono text-xs leading-relaxed">
              <p className="text-slate-400 mb-2">// Formule article 150 VH bis</p>
              <p>Plus-value =</p>
              <p className="pl-4">Prix de cession</p>
              <p className="pl-4">− (Prix de revient global × Prix de cession / Valeur globale du portefeuille)</p>
            </div>

            <div className="space-y-3">
              {loiTerms.map(({ term, def }) => (
                <div key={term} className="flex gap-3">
                  <span className="shrink-0 font-semibold text-slate-900 w-52">{term}</span>
                  <span>{def}</span>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 space-y-1">
              <p className="font-semibold">Points importants à ne pas oublier</p>
              {loiPoints.map((point, i) => (
                <p key={i}>• {point}</p>
              ))}
            </div>

            <p className="text-xs text-slate-400">
              Cette application est un outil d&apos;aide à la déclaration. Elle ne constitue pas un conseil fiscal.
              En cas de doute, consultez un expert-comptable ou l&apos;administration fiscale (impots.gouv.fr).
            </p>
          </div>
        </section>

      </div>

      {/* Bouton retour en haut */}
      <button
        onClick={scrollToTop}
        aria-label="Remonter en haut"
        className={`fixed bottom-8 right-8 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg transition-all duration-300 hover:bg-teal-700 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
          showTopBtn ? 'translate-y-0 opacity-100' : 'translate-y-4 pointer-events-none opacity-0'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </main>
  );
}
