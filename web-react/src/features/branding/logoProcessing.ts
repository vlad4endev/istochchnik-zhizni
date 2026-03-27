/** Совпадает с Flutter `project_branding_provider.dart` (_maxLogoDataUrlChars). */
export const MAX_LOGO_DATA_URL_CHARS = 900_000;

const LEGACY_DEFAULT_LOGO_ASSET_PATH = 'assets/logo.svg';
const DEFAULT_LOGO_ASSET_PATH = 'assets/logo_primary.png';

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
    img.src = dataUrl;
  });
}

function opaqueBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { minX: number; minY: number; w: number; h: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a <= 8) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function applyRemoveLightBackground(imageData: ImageData): void {
  const { data, width, height } = imageData;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a === 0) continue;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const drg = Math.abs(r - g);
      const dgb = Math.abs(g - b);
      const drb = Math.abs(r - b);
      const almostNeutral = drg <= 14 && dgb <= 14 && drb <= 14;
      const nearWhite = r >= 242 && g >= 242 && b >= 242;
      const nearLightGray = almostNeutral && r >= 206 && g >= 206 && b >= 206;

      if (nearWhite || nearLightGray) {
        data[i + 3] = 0;
      }
    }
  }
}

function rasterToProcessedPngDataUrl(
  sourceCanvas: HTMLCanvasElement,
  removeLightBackground: boolean,
): string {
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) return sourceCanvas.toDataURL('image/png');

  let work = sourceCanvas;
  let imageData = ctx.getImageData(0, 0, work.width, work.height);

  if (removeLightBackground) {
    applyRemoveLightBackground(imageData);
    ctx.putImageData(imageData, 0, 0);
  }

  const b = opaqueBounds(imageData.data, imageData.width, imageData.height);
  if (!b) {
    return work.toDataURL('image/png');
  }

  const crop = document.createElement('canvas');
  crop.width = b.w;
  crop.height = b.h;
  const cCtx = crop.getContext('2d');
  if (!cCtx) return work.toDataURL('image/png');
  cCtx.drawImage(work, b.minX, b.minY, b.w, b.h, 0, 0, b.w, b.h);

  const side = Math.max(crop.width, crop.height);
  const pad = Math.max(8, Math.round(side * 0.06));
  const padded = document.createElement('canvas');
  padded.width = crop.width + pad * 2;
  padded.height = crop.height + pad * 2;
  const pCtx = padded.getContext('2d');
  if (!pCtx) return crop.toDataURL('image/png');
  pCtx.clearRect(0, 0, padded.width, padded.height);
  pCtx.drawImage(crop, pad, pad);

  return padded.toDataURL('image/png');
}

async function dataUrlToDownscaledPng(dataUrl: string, maxEdge: number): Promise<string> {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w <= 0 || h <= 0) return dataUrl;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const c = document.createElement('canvas');
  c.width = tw;
  c.height = th;
  const ctx = c.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, tw, th);
  return c.toDataURL('image/png');
}

/**
 * Обрабатывает data URL логотипа (аналог Dart `_processLogoDataUrl`).
 */
export async function processLogoDataUrl(
  dataUrl: string,
  options: { removeLightBackground: boolean },
): Promise<string> {
  const trimmed = dataUrl.trim();
  const head = trimmed.slice(0, 80).toLowerCase();
  if (head.includes('image/svg+xml')) {
    return trimmed;
  }

  const img = await loadImage(trimmed);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  if (!ctx) return trimmed;
  ctx.drawImage(img, 0, 0);
  return rasterToProcessedPngDataUrl(c, options.removeLightBackground);
}

/** Уменьшает PNG, если строка не влезает в лимит хранилища (`_fitLogoDataUrlToStorage`). */
export async function fitLogoDataUrlToStorage(dataUrl: string): Promise<string> {
  if (dataUrl.length <= MAX_LOGO_DATA_URL_CHARS) {
    return dataUrl;
  }
  let next = await dataUrlToDownscaledPng(dataUrl, 320);
  if (next.length <= MAX_LOGO_DATA_URL_CHARS) {
    return next;
  }
  next = await dataUrlToDownscaledPng(next, 200);
  return next.length <= MAX_LOGO_DATA_URL_CHARS ? next : dataUrl;
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result === 'string') resolve(r.result);
      else reject(new Error('Ожидалась строка data URL'));
    };
    r.onerror = () => reject(new Error('Ошибка чтения файла'));
    r.readAsDataURL(file);
  });
}

export { DEFAULT_LOGO_ASSET_PATH, LEGACY_DEFAULT_LOGO_ASSET_PATH };
