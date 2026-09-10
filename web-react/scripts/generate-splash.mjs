/**
 * Генератор `apple-touch-startup-image` для iOS-PWA.
 *
 * Заменяет прежний вызов pwa-asset-generator в скрипте `pwa:splash`, у которого
 * было две проблемы:
 *
 * 1. Он получал на вход `public/assets/logo.svg` — иконку с белой «плашкой»
 *    (squircle) и тенью. Ни один из лежащих в public/pwa сплэшей так не выглядит:
 *    там крест без плашки, то есть набор собран из `logo_minimal.svg`. Скрипт
 *    молча разошёлся с результатом и перегенерация меняла дизайн.
 * 2. В landscape он считал отступы от длинной стороны. На iPhone 14 (390x844)
 *    крест в портрете занимает 46.7% короткой стороны, а в ландшафте — 16%:
 *    один и тот же экран, а логотип при повороте съёживается в три раза.
 *
 * Здесь правило одно и то же для обеих ориентаций: SVG рисуется в квадрат со
 * стороной 64% короткой стороны холста (те самые `-p 18%` с каждого края) и
 * центрируется. Это ровно та геометрия, что у уже закоммиченных портретов:
 * высота креста = 0.466 * min(width, height).
 *
 * По умолчанию скрипт пишет только отсутствующие файлы — чтобы перегенерация не
 * трогала байты готовых картинок (librsvg и Chrome по-разному сглаживают края,
 * геометрия при этом совпадает). `--force` перезаписывает всё.
 *
 * Список размеров должен совпадать с <link rel="apple-touch-startup-image"> в
 * index.html: iOS выбирает картинку строго по media-запросу и при промахе
 * показывает белый экран вместо сплэша.
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_SVG = path.join(ROOT, 'public/assets/logo_minimal.svg');
const OUT_DIR = path.join(ROOT, 'public/pwa');

/** Фон совпадает с `background_color` манифеста и с `--surface` светлой темы. */
const BACKGROUND = '#f4f1ed';

/** Доля короткой стороны холста, которую занимает квадрат с логотипом. */
const CONTENT_SCALE = 0.64;

/**
 * Устройства в CSS-пикселях (портретная ориентация) и их devicePixelRatio.
 * Портрет и ландшафт получаются перестановкой сторон, поэтому храним по одной
 * записи на устройство.
 */
const DEVICES = [
  { width: 1032, height: 1376, ratio: 2 }, // iPad Pro 13" (M4)
  { width: 1024, height: 1366, ratio: 2 }, // iPad Pro 12.9"
  { width: 834, height: 1210, ratio: 2 }, // iPad Pro 11" (M4)
  { width: 834, height: 1194, ratio: 2 }, // iPad Pro 11"
  { width: 768, height: 1024, ratio: 2 }, // iPad 9.7"
  { width: 820, height: 1180, ratio: 2 }, // iPad 10.9"
  { width: 834, height: 1112, ratio: 2 }, // iPad Pro 10.5"
  { width: 810, height: 1080, ratio: 2 }, // iPad 10.2"
  { width: 744, height: 1133, ratio: 2 }, // iPad mini 8.3"
  { width: 440, height: 956, ratio: 3 }, // iPhone 16 Pro Max
  { width: 402, height: 874, ratio: 3 }, // iPhone 16
  { width: 420, height: 912, ratio: 3 }, // iPhone 16 Pro
  { width: 430, height: 932, ratio: 3 }, // iPhone 14/15 Pro Max
  { width: 393, height: 852, ratio: 3 }, // iPhone 14/15 Pro
  { width: 390, height: 844, ratio: 3 }, // iPhone 12/13/14
  { width: 428, height: 926, ratio: 3 }, // iPhone 12/13 Pro Max
  { width: 375, height: 812, ratio: 3 }, // iPhone X / XS / 11 Pro
  { width: 414, height: 896, ratio: 3 }, // iPhone 11 Pro Max / XS Max
  { width: 414, height: 896, ratio: 2 }, // iPhone 11 / XR
  { width: 414, height: 736, ratio: 3 }, // iPhone 8 Plus
  { width: 375, height: 667, ratio: 2 }, // iPhone 8 / SE 2-3
  { width: 320, height: 568, ratio: 2 }, // iPhone SE 1
];

/** @returns {{ width: number, height: number, orientation: 'portrait' | 'landscape' }[]} */
function canvases() {
  const out = [];
  for (const device of DEVICES) {
    const w = device.width * device.ratio;
    const h = device.height * device.ratio;
    out.push({ width: w, height: h, orientation: 'portrait' });
    out.push({ width: h, height: w, orientation: 'landscape' });
  }
  return out;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const force = process.argv.includes('--force');
  const svg = await readFile(SOURCE_SVG);
  await mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;

  for (const canvas of canvases()) {
    const file = path.join(OUT_DIR, `apple-splash-${canvas.width}-${canvas.height}.png`);
    if (!force && (await exists(file))) {
      skipped += 1;
      continue;
    }

    const side = Math.round(CONTENT_SCALE * Math.min(canvas.width, canvas.height));
    // `density` подбираем так, чтобы librsvg растрировал вектор сразу в нужный
    // размер: пересэмплирование растра размывало бы скругления штриха.
    const logo = await sharp(svg, { density: Math.max(72, Math.ceil((side / 512) * 72)) })
      .resize(side, side, { fit: 'contain', background: BACKGROUND })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: canvas.width,
        height: canvas.height,
        channels: 3,
        background: BACKGROUND,
      },
    })
      .composite([{ input: logo, gravity: 'centre' }])
      .png({ compressionLevel: 9, palette: false })
      .toFile(file);

    written += 1;
  }

  const mode = force ? 'перезаписано' : 'создано';
  console.log(`${mode}: ${written}, пропущено (уже есть): ${skipped}`);
  if (!force && skipped > 0) {
    console.log('Полная перегенерация: npm run pwa:splash -- --force');
  }

  if (process.argv.includes('--print-links')) {
    console.log('');
    for (const device of DEVICES) {
      const w = device.width * device.ratio;
      const h = device.height * device.ratio;
      for (const [file, orientation] of [
        [`${w}-${h}`, 'portrait'],
        [`${h}-${w}`, 'landscape'],
      ]) {
        console.log(
          `<link rel="apple-touch-startup-image" href="/pwa/apple-splash-${file}.png" ` +
            `media="(device-width: ${device.width}px) and (device-height: ${device.height}px) ` +
            `and (-webkit-device-pixel-ratio: ${device.ratio}) and (orientation: ${orientation})" />`,
        );
      }
    }
  }
}

await main();
