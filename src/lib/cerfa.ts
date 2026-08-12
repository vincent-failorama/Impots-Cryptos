import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

/**
 * Les polices standard PDF (Helvetica) utilisent l'encodage WinAnsi, qui ne
 * couvre pas l'intégralité d'Unicode. Un caractère non supporté (emoji, ₿, CJK…)
 * saisi par l'utilisateur ferait échouer `drawText`. On remplace donc en amont
 * les caractères problématiques par un équivalent ASCII.
 */
const REPLACEMENTS: Record<string, string> = {
  "₿": "BTC", "Ξ": "ETH", "→": "->", "←": "<-", "•": "-",
  "’": "'", "‘": "'", "“": '"', "”": '"', " ": " ",
};

export function sanitizeForPdf(input: string): string {
  const replaced = Array.from(input ?? "")
    .map((ch) => REPLACEMENTS[ch] ?? ch)
    .join("");
  // WinAnsi couvre grosso modo Latin-1 + quelques signes (€, —, …).
  return replaced.replace(/[^\x20-\x7E -ÿ€—…‰™©®]/g, "?");
}

const A4: [number, number] = [595, 842];
const MARGIN = 48;
const COLOR_TEXT = rgb(0.09, 0.11, 0.15);
const COLOR_MUTED = rgb(0.45, 0.5, 0.56);
const COLOR_ACCENT = rgb(0.05, 0.46, 0.44);
const COLOR_RULE = rgb(0.85, 0.88, 0.9);

/** Curseur de mise en page : gère la position verticale et les sauts de page. */
class Layout {
  private page: PDFPage;
  private y: number;

  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont
  ) {
    this.page = doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  /** Réserve `needed` points ; ajoute une page si la place manque. */
  private ensure(needed: number) {
    if (this.y - needed < MARGIN) {
      this.page = this.doc.addPage(A4);
      this.y = A4[1] - MARGIN;
    }
  }

  gap(h: number) {
    this.ensure(h);
    this.y -= h;
  }

  title(text: string) {
    this.ensure(30);
    this.page.drawText(sanitizeForPdf(text), {
      x: MARGIN, y: this.y, size: 18, font: this.bold, color: COLOR_TEXT,
    });
    this.y -= 26;
  }

  heading(text: string) {
    this.ensure(34);
    this.y -= 8;
    this.page.drawText(sanitizeForPdf(text), {
      x: MARGIN, y: this.y, size: 13, font: this.bold, color: COLOR_ACCENT,
    });
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4[0] - MARGIN, y: this.y },
      thickness: 0.8,
      color: COLOR_RULE,
    });
    this.y -= 14;
  }

  /** Ligne « libellé …… valeur », la valeur alignée à droite. */
  row(label: string, value: string, opts: { strong?: boolean; muted?: boolean } = {}) {
    this.ensure(18);
    const size = 10.5;
    const font = opts.strong ? this.bold : this.font;
    const color = opts.muted ? COLOR_MUTED : COLOR_TEXT;

    this.page.drawText(sanitizeForPdf(label), { x: MARGIN, y: this.y, size, font: this.font, color });

    const safeValue = sanitizeForPdf(value);
    const width = font.widthOfTextAtSize(safeValue, size);
    this.page.drawText(safeValue, {
      x: A4[0] - MARGIN - width, y: this.y, size, font, color: opts.strong ? COLOR_TEXT : color,
    });
    this.y -= 16;
  }

  paragraph(text: string, size = 9) {
    const maxWidth = A4[0] - MARGIN * 2;
    const words = sanitizeForPdf(text).split(/\s+/);
    let line = "";

    const flush = () => {
      if (!line) return;
      this.ensure(14);
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font: this.font, color: COLOR_MUTED });
      this.y -= 12;
      line = "";
    };

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (this.font.widthOfTextAtSize(candidate, size) > maxWidth) flush();
      line = line ? `${line} ${word}` : word;
      if (this.font.widthOfTextAtSize(line, size) > maxWidth) flush();
    }
    flush();
  }
}

const eur = (n: number) =>
  `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;

export type CerfaYearSummary = {
  year: number;
  /** Case 3AN — plus-value imposable */
  case3AN: number;
  /** Case 3BN — moins-value */
  case3BN: number;
  /** Case 3VH — total des prix de cession */
  case3VH: number;
  cessionCount: number;
};

export type CerfaBncSummary = {
  year: number;
  total: number;
  staking: number;
  mining: number;
  airdrop: number;
};

export type CerfaAccount = {
  institution: string;
  url: string;
  country: string;
  accountNumber: string;
  openingDate: string;
  closingDate?: string;
};

export type CerfaPayload = {
  generatedAt: Date;
  years: CerfaYearSummary[];
  bnc: CerfaBncSummary[];
  accounts: CerfaAccount[];
};

/**
 * Génère la fiche récapitulative PDF : Cerfa 2086 (plus-values),
 * revenus BNC et Cerfa 3916-bis (comptes à l'étranger).
 */
export async function generateCerfaPdf(payload: CerfaPayload): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const L = new Layout(doc, font, bold);

  doc.setTitle("Recapitulatif fiscal crypto-actifs");
  doc.setCreator("crypto-tax-fr");

  L.title("Récapitulatif fiscal — crypto-actifs");
  L.paragraph(
    `Document généré le ${payload.generatedAt.toLocaleDateString("fr-FR")} par crypto-tax-fr. ` +
    `Aide à la déclaration — ne constitue pas un conseil fiscal.`
  );

  // ── Cerfa 2086 ────────────────────────────────────────────────────────────
  L.heading("Cerfa 2086 — Plus-values de cession d'actifs numériques");
  if (payload.years.length === 0) {
    L.paragraph("Aucune cession imposable sur la période.");
  } else {
    for (const y of payload.years) {
      L.gap(6);
      L.row(`Année fiscale ${y.year}`, `${y.cessionCount} cession(s)`, { strong: true });
      L.row("  Case 3AN — Plus-value imposable", eur(y.case3AN));
      L.row("  Case 3BN — Moins-value", eur(y.case3BN));
      L.row("  Case 3VH — Total des prix de cession", eur(y.case3VH));
    }
    L.gap(4);
    L.paragraph(
      "Calcul selon la méthode proportionnelle de l'article 150 VH bis du CGI. " +
      "Les échanges crypto-crypto bénéficient du sursis d'imposition et ne sont pas comptabilisés comme cessions."
    );
  }

  // ── BNC ───────────────────────────────────────────────────────────────────
  if (payload.bnc.length > 0) {
    L.heading("Revenus BNC — Staking / Mining / Airdrop (2042-C-PRO, case 5HQ)");
    for (const b of payload.bnc) {
      L.gap(6);
      L.row(`Année ${b.year}`, eur(b.total), { strong: true });
      if (b.staking > 0) L.row("  Staking", eur(b.staking), { muted: true });
      if (b.mining > 0) L.row("  Mining", eur(b.mining), { muted: true });
      if (b.airdrop > 0) L.row("  Airdrop", eur(b.airdrop), { muted: true });
    }
    L.gap(4);
    L.paragraph(
      "Ces revenus sont imposables à la date de réception, indépendamment des plus-values de cession."
    );
  }

  // ── Cerfa 3916-bis ────────────────────────────────────────────────────────
  L.heading("Cerfa 3916-bis — Comptes d'actifs numériques à l'étranger");
  if (payload.accounts.length === 0) {
    L.paragraph("Aucun compte déclaré.");
  } else {
    for (const a of payload.accounts) {
      L.gap(6);
      L.row(a.institution, a.country, { strong: true });
      L.row("  Numéro de compte", a.accountNumber || "-", { muted: true });
      if (a.url) L.row("  Site", a.url, { muted: true });
      const period = a.closingDate
        ? `${fmtDate(a.openingDate)} - ${fmtDate(a.closingDate)}`
        : `Ouvert depuis le ${fmtDate(a.openingDate)}`;
      L.row("  Période", period, { muted: true });
    }
    L.gap(4);
    L.paragraph(
      "Un formulaire 3916-bis doit être déposé pour chaque compte détenu à l'étranger. " +
      "Le défaut de déclaration est passible d'une amende de 750 EUR par compte (art. 1736 X du CGI)."
    );
  }

  return doc.save();
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR");
}
