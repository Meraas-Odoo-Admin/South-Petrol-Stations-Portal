import { PDFDocument } from 'pdf-lib';

// ID-1 card, 53.98 × 85.60 mm, in PDF points (1 pt = 1/72 in).
export const CARD_WIDTH_MM = 53.98;
export const CARD_HEIGHT_MM = 85.6;
const PT_PER_MM = 72 / 25.4;
export const CARD_WIDTH_PT = CARD_WIDTH_MM * PT_PER_MM;
export const CARD_HEIGHT_PT = CARD_HEIGHT_MM * PT_PER_MM;

// Chromium quantizes the page it prints to whole device units, so the PDF
// comes out ~54.02 × 85.68 mm even though the template asks for the exact
// card size. Card-printer drivers can scale or refuse a page that isn't the
// card, so every page is cut back to exactly 53.98 × 85.60 mm. Content is
// anchored top-left; only the sub-0.1 mm overshoot at the right and bottom
// edges is removed (the template carries a 1 px bleed there for this).
export async function fitPdfToCard(pdf: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  for (const page of doc.getPages()) {
    const { height } = page.getSize();
    const box = [0, height - CARD_HEIGHT_PT, CARD_WIDTH_PT, CARD_HEIGHT_PT] as const;
    page.setMediaBox(...box);
    page.setCropBox(...box);
    page.setBleedBox(...box);
    page.setTrimBox(...box);
    page.setArtBox(...box);
  }
  // No object streams, so the page tree stays readable as plain PDF text.
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

// Page sizes (mm) as a PDF viewer or print driver sees them: the CropBox,
// which is what viewers and drivers use as the page.
export async function pdfPageSizesMm(pdf: Buffer): Promise<Array<{ width: number; height: number }>> {
  const doc = await PDFDocument.load(pdf);
  return doc.getPages().map((page) => {
    const { width, height } = page.getCropBox();
    return { width: width / PT_PER_MM, height: height / PT_PER_MM };
  });
}

export function isExactCardSize(size: { width: number; height: number }, toleranceMm = 0.01): boolean {
  return Math.abs(size.width - CARD_WIDTH_MM) <= toleranceMm && Math.abs(size.height - CARD_HEIGHT_MM) <= toleranceMm;
}
