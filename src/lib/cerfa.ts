import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type Cerfa2086Payload = {
  referenceYear: number;
  case3AN: number;
  case3BN: number;
  case3VH: number;
  taxpayerName: string;
  taxpayerNif: string;
};

export async function generateCerfa2086(payload: Cerfa2086Payload) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const lineHeight = 18;
  const margin = 40;
  let y = 820;

  page.drawText(`Cerfa 2086 - Déclaration de plus-values crypto`, {
    x: margin,
    y,
    size: 16,
    font,
    color: rgb(0, 0, 0),
  });

  y -= lineHeight * 2;
  page.drawText(`Année fiscale : ${payload.referenceYear}`, { x: margin, y, size: 12, font });
  y -= lineHeight;
  page.drawText(`Nom / Société : ${payload.taxpayerName}`, { x: margin, y, size: 12, font });
  y -= lineHeight;
  page.drawText(`NIF : ${payload.taxpayerNif}`, { x: margin, y, size: 12, font });
  y -= lineHeight * 2;
  page.drawText(`3AN - Plus-values : ${payload.case3AN.toFixed(2)} €`, { x: margin, y, size: 12, font });
  y -= lineHeight;
  page.drawText(`3BN - Moins-values : ${payload.case3BN.toFixed(2)} €`, { x: margin, y, size: 12, font });
  y -= lineHeight;
  page.drawText(`3VH - Total des cessions imposables : ${payload.case3VH.toFixed(2)} €`, {
    x: margin,
    y,
    size: 12,
    font,
  });

  return pdfDoc.save();
}

export type Cerfa3916bisPayload = {
  taxpayerName: string;
  accountLabel: string;
  accountNumber: string;
  institutionName: string;
  institutionCountry: string;
  year: number;
};

export async function generateCerfa3916bis(payload: Cerfa3916bisPayload) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const lineHeight = 18;
  const margin = 40;
  let y = 820;

  page.drawText(`Cerfa 3916-bis - Déclaration de comptes crypto à l'étranger`, {
    x: margin,
    y,
    size: 14,
    font,
  });

  y -= lineHeight * 2;
  page.drawText(`Année : ${payload.year}`, { x: margin, y, size: 12, font });
  y -= lineHeight;
  page.drawText(`Titulaire : ${payload.taxpayerName}`, { x: margin, y, size: 12, font });
  y -= lineHeight;
  page.drawText(`Institution : ${payload.institutionName}`, { x: margin, y, size: 12, font });
  y -= lineHeight;
  page.drawText(`Pays : ${payload.institutionCountry}`, { x: margin, y, size: 12, font });
  y -= lineHeight;
  page.drawText(`Numéro de compte : ${payload.accountNumber}`, { x: margin, y, size: 12, font });
  y -= lineHeight;
  page.drawText(`Libellé du compte : ${payload.accountLabel}`, { x: margin, y, size: 12, font });

  return pdfDoc.save();
}
