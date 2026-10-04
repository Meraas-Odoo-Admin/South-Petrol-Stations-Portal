import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser } from 'playwright-core';
import QRCode from 'qrcode';
import {
  buildCardHtml,
  buildTestCardHtml,
  type CardFaceData,
  type CardRenderMode,
} from './card-html';
import { loadCardAssets } from './card-assets';
import { fitPdfToCard } from './pdf-page-size';

// 300 dpi design px → CSS px (96 per inch). 638 × 1011 px at this scale is
// exactly the ID-1 card, 53.98 × 85.60 mm.
const DESIGN_TO_CSS_SCALE = 96 / 300;

// Why Chromium and not pdfkit (the engine reports already use): a test
// render with pdfkit put Arabic words in the wrong order (no bidi) and
// rendered every left-to-right code as empty boxes — see
// docs/card-rendering/. Chromium lays the card out exactly as the design
// file does.
//
// ONE browser process for the life of the API, reused by every render (a
// fresh page per card); relaunched only if it dies. In Docker it's the
// system Chromium (CARD_CHROMIUM_PATH, e.g. /usr/bin/chromium); locally,
// without that variable, playwright-core uses the Chromium Playwright
// installed for the web e2e suite.
@Injectable()
export class CardRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(CardRendererService.name);
  private browser: Promise<Browser> | null = null;
  private closing = false;

  private getBrowser(): Promise<Browser> {
    if (!this.browser) {
      const executablePath = process.env.CARD_CHROMIUM_PATH || undefined;
      this.browser = chromium
        .launch({ executablePath, args: ['--disable-dev-shm-usage', '--font-render-hinting=none'] })
        .then((browser) => {
          browser.on('disconnected', () => {
            if (!this.closing) {
              this.logger.warn('Card renderer browser disconnected — will relaunch on next render.');
            }
            this.browser = null;
          });
          return browser;
        })
        .catch((error: unknown) => {
          this.browser = null;
          throw error;
        });
    }
    return this.browser;
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    const browser = await this.browser?.catch(() => null);
    this.browser = null;
    await browser?.close().catch(() => undefined);
  }

  // Error-correction level H: the card still scans with ~30% of the QR
  // scratched or dirty. The payload is the card number alone.
  qrSvg(content: string): Promise<string> {
    return QRCode.toString(content, { type: 'svg', errorCorrectionLevel: 'H', margin: 0, color: { dark: '#000000', light: '#ffffff' } }).then(
      (svg) => svg.replace('<svg ', '<svg width="354" height="354" shape-rendering="crispEdges" '),
    );
  }

  private async withPage<T>(
    html: string,
    fn: (page: import('playwright-core').Page) => Promise<T>,
    viewport: { width: number; height: number } = { width: 638, height: 1011 },
  ): Promise<T> {
    const browser = await this.getBrowser();
    const page = await browser.newPage({ viewport });
    try {
      // JavaScript only runs our own fit script; no network is ever used.
      await page.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort()));
      await page.setContent(html, { waitUntil: 'load' });
      // Strings, not functions: the API's tsconfig has no DOM lib.
      await page.evaluate('document.fonts.ready.then(() => true)');
      await page.waitForFunction('window.__cardReady === true');
      return await fn(page);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private async pdfFromHtml(html: string): Promise<Buffer> {
    const raw = await this.withPage(html, (page) =>
      page.pdf({
        // The @page rule in the template sets 53.98 × 85.6 mm; it lands
        // more precisely than page.pdf's own width/height (which round the
        // width out to 54.36 mm).
        preferCSSPageSize: true,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        scale: DESIGN_TO_CSS_SCALE,
      }),
    );
    return fitPdfToCard(raw);
  }

  renderCardPdf(data: Omit<CardFaceData, 'qrSvg'>, mode: CardRenderMode): Promise<Buffer> {
    return this.qrSvg(data.cardNumber).then((qrSvg) =>
      this.pdfFromHtml(buildCardHtml({ ...data, qrSvg }, mode, loadCardAssets())),
    );
  }

  // An A4 page rendered from HTML with the same offline Chromium — used by
  // the posted "registration stations" sheet. The HTML sets its own @page
  // size and margins, and sets window.__cardReady once its fonts are loaded.
  renderA4Pdf(html: string): Promise<Buffer> {
    return this.withPage(
      html,
      async (page) =>
        Buffer.from(
          await page.pdf({ preferCSSPageSize: true, printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } }),
        ),
      { width: 794, height: 1123 },
    );
  }

  // On-screen preview of the card front (PNG, at design size).
  async renderCardPreviewPng(data: Omit<CardFaceData, 'qrSvg'>): Promise<Buffer> {
    const qrSvg = await this.qrSvg(data.cardNumber);
    const html = buildCardHtml({ ...data, qrSvg }, 'full', loadCardAssets());
    return this.withPage(html, (page) => page.locator('.page').first().screenshot({ type: 'png' }));
  }

  // Desk setup / ribbon change: alignment marks + a sample QR that is NOT a
  // card number, so scanning it at a pump never resolves to a vehicle.
  async renderTestCardPdf(officeName: string): Promise<Buffer> {
    const qrSvg = await this.qrSvg('TEST-CARD');
    return this.pdfFromHtml(buildTestCardHtml(qrSvg, officeName, loadCardAssets()));
  }
}
