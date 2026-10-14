import { PDFDocument } from 'pdf-lib';
import { CARD_HEIGHT_MM, CARD_WIDTH_MM, fitPdfToCard, isExactCardSize, pdfPageSizesMm } from './pdf-page-size';

const MM = 72 / 25.4;

describe('fitPdfToCard', () => {
  // Chromium's quantized landscape page: 85.64 x 54.02 mm.
  async function chromiumSizedPdf(pages: number): Promise<Buffer> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i += 1) doc.addPage([85.64 * MM, 54.02 * MM]);
    return Buffer.from(await doc.save());
  }

  it('cuts every page to exactly 85.60 x 53.98 mm (landscape) (to 0.01 mm)', async () => {
    const before = await pdfPageSizesMm(await chromiumSizedPdf(2));
    expect(before.every((s) => isExactCardSize(s))).toBe(false);

    const fitted = await fitPdfToCard(await chromiumSizedPdf(2));
    const sizes = await pdfPageSizesMm(fitted);
    expect(sizes).toHaveLength(2);
    for (const size of sizes) {
      expect(Math.abs(size.width - CARD_WIDTH_MM)).toBeLessThan(0.01);
      expect(Math.abs(size.height - CARD_HEIGHT_MM)).toBeLessThan(0.01);
    }
  });

  it('sets the MediaBox too, and keeps the page tree readable', async () => {
    const fitted = await fitPdfToCard(await chromiumSizedPdf(1));
    const page = (await PDFDocument.load(fitted)).getPage(0);
    expect(page.getMediaBox().width).toBeCloseTo(242.6457, 3);
    expect(page.getMediaBox().height).toBeCloseTo(153.0142, 3);
    expect((fitted.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length).toBe(1);
  });
});
