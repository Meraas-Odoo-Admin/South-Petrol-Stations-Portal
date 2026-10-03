import { readFileSync } from 'fs';
import path from 'path';
import type { CardAssets } from './card-html';

// apps/api/assets — the same relative depth from src/cards/render (ts-jest,
// ts-node) and dist/cards/render (compiled), so one path serves both.
export const ASSETS_DIR = path.resolve(__dirname, '../../../assets');

const WEIGHTS = [600, 700, 800, 900] as const;

// Cairo ships split into an Arabic and a Latin file per weight; unicode-range
// lets Chromium pick the right file per character, so Arabic text and the
// left-to-right codes (plate, card number, dates) both come out in Cairo.
// Fonts are embedded as data: URIs — the renderer never fetches anything
// from the network (production may have no internet access).
const ARABIC_RANGE = 'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0898-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC';
const LATIN_RANGE = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

let cached: CardAssets | null = null;

export function loadCardAssets(): CardAssets {
  if (cached) return cached;
  const fontDir = path.join(ASSETS_DIR, 'fonts', 'cairo');
  const face = (subset: 'arabic' | 'latin', weight: number, range: string) => {
    const data = readFileSync(path.join(fontDir, `cairo-${subset}-${weight}-normal.woff2`)).toString('base64');
    return `@font-face{font-family:'Cairo';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${range};}`;
  };
  const fontFaceCss = WEIGHTS.map((w) => face('arabic', w, ARABIC_RANGE) + face('latin', w, LATIN_RANGE)).join('');
  const logo = readFileSync(path.join(ASSETS_DIR, 'card', 'dabt-alwaqud-symbol-white.svg')).toString('base64');
  cached = { fontFaceCss, logoWhiteDataUri: `data:image/svg+xml;base64,${logo}` };
  return cached;
}
