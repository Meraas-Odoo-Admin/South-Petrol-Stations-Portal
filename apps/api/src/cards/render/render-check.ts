// Build-time smoke test for the card renderer (run by apps/api/Dockerfile,
// and runnable locally: `node dist/cards/render/render-check.js`).
//
// The API renders cards with playwright-core driving the SYSTEM Chromium
// (CARD_CHROMIUM_PATH). The two are versioned independently, so a Chromium
// update that playwright-core can't drive must fail the image build — not a
// registration desk on the day a card is printed. Renders a test card and a
// sample card and checks each is a real PDF of the right shape.
import { CardRendererService } from './card-renderer.service';
import { isExactCardSize, pdfPageSizesMm } from './pdf-page-size';

async function main(): Promise<void> {
  const renderer = new CardRendererService();
  try {
    const checks: Array<[string, Buffer, number]> = [
      ['test card', await renderer.renderTestCardPdf('مديرية أمن سبها'), 1],
      ['printer setup card', await renderer.renderPrinterSetupPdf(), 1],
      [
        'sample card',
        await renderer.renderCardPdf(
          {
            cardNumber: 'SBH-7K2M9Q4X',
            plate: '8-1234567',
            makeModel: 'تويوتا هايلكس',
            color: 'أبيض',
            year: '2018',
            fuel: 'بنزين',
            chassis: 'JTFDE626400123456',
            booklet: '1234567',
            officeName: 'مديرية أمن سبها',
            issueDate: '2026-09-27',
            stationCode: 'REG-000001',
          },
          'full',
        ),
        1,
      ],
    ];
    for (const [name, pdf, expectedPages] of checks) {
      const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
      if (pdf.subarray(0, 5).toString() !== '%PDF-' || pages !== expectedPages || pdf.length < 5000) {
        throw new Error(`${name}: bad PDF (${pdf.length} bytes, ${pages} pages, expected ${expectedPages})`);
      }
      const sizes = await pdfPageSizesMm(pdf);
      if (!sizes.every((size) => isExactCardSize(size))) {
        throw new Error(`${name}: page size is not 85.60 x 53.98 mm (landscape): ${JSON.stringify(sizes)}`);
      }
      console.log(`card render check: ${name} OK (${pdf.length} bytes, ${pages} pages)`);
    }
  } finally {
    await renderer.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  console.error('card render check FAILED:', error);
  process.exit(1);
});
