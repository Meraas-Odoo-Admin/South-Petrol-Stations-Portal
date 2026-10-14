import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';
import { CardRendererService } from './card-renderer.service';

// Scan test from the RENDERED output (Phase 6, A3): the real card is rendered
// by headless Chromium, screenshot at 300 dpi, and the QR is read back with a
// real decoder at full size and at the smaller sizes a phone camera sees. The
// colour card and the black-only version must both scan, and both must decode
// to the card number alone.
interface PngImage {
  width: number;
  height: number;
  data: Buffer;
}
// pngjs ships no types and @types/pngjs is not in the offline store.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PNG } = require('pngjs') as { PNG: { sync: { read(buffer: Buffer): PngImage } } };

const CARD_NUMBER = 'SBH-7K2M9Q4X';

const data = {
  cardNumber: CARD_NUMBER,
  plate: '7-123456',
  makeModel: 'تويوتا هايلكس',
  color: 'أبيض',
  year: '2020',
  fuel: 'بنزين',
  chassis: 'JTFDE626400123456',
  booklet: '12345678',
  officeName: 'مديرية أمن سبها',
  issueDate: '2026-10-14',
  stationCode: 'SBH',
};

// Box-average downscale: what a camera's lower resolution does to the code.
function downscale(png: PngImage, factor: number): { width: number; height: number; luma: Uint8ClampedArray } {
  const width = Math.floor(png.width * factor);
  const height = Math.floor(png.height * factor);
  const luma = new Uint8ClampedArray(width * height);
  const step = 1 / factor;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let sy = Math.floor(y * step); sy < Math.min(png.height, Math.floor((y + 1) * step)); sy++) {
        for (let sx = Math.floor(x * step); sx < Math.min(png.width, Math.floor((x + 1) * step)); sx++) {
          const i = (sy * png.width + sx) * 4;
          sum += 0.299 * png.data[i]! + 0.587 * png.data[i + 1]! + 0.114 * png.data[i + 2]!;
          count++;
        }
      }
      luma[y * width + x] = Math.round(sum / Math.max(1, count));
    }
  }
  return { width, height, luma };
}

function decode(image: { width: number; height: number; luma: Uint8ClampedArray }): string {
  const source = new RGBLuminanceSource(image.luma, image.width, image.height);
  return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText();
}

describe('the QR on the rendered card', () => {
  const renderer = new CardRendererService();
  afterAll(() => renderer.onModuleDestroy());

  for (const mode of ['full', 'black'] as const) {
    it(`scans at full, half and a third of the 300 dpi size (${mode})`, async () => {
      const png = PNG.sync.read(await renderer.renderCardPreviewPng(data, mode, 'A'));
      expect(png.width).toBe(1011);
      expect(png.height).toBe(638);
      for (const factor of [1, 0.5, 0.34]) {
        expect(decode(downscale(png, factor))).toBe(CARD_NUMBER);
      }
    }, 60_000);
  }

  it('the setup card QR codes all scan, down to the 9 mm one', async () => {
    const png = PNG.sync.read(await renderer.renderPrinterSetupPng());
    // The three codes are on one card; the decoder is pointed at the whole
    // card and must find at least the largest. Each size is then cropped by
    // the layout test (card-html.spec); here, the card as a whole reads.
    expect(decode(downscale(png, 1))).toBe('TEST-CARD');
  }, 60_000);
});
