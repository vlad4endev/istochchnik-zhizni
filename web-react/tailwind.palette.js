/**
 * Тематические палитры Tailwind.
 *
 * Раньше светлые утилиты (`bg-emerald-100`, `text-stone-900`, `border-red-200` …) в тёмных темах
 * «чинились» глобальными `html.dark .класс { … !important }`. Это не работало для оттенков
 * без правила (светлый пастельный фон + светлый токен текста = нечитаемо), не знало про
 * hover/opacity и плодило сотни строк CSS.
 *
 * Теперь цвета, которым нужна адаптация, объявлены CSS-переменными-«каналами» (`R G B`), а
 * значения переменных переключает тема на <html>. Утилиты остаются обычными (`bg-emerald-100/60`,
 * `hover:text-red-700`, градиенты, ring/divide) — Tailwind сам подставляет альфу.
 *
 * Светлая тема = стандартная палитра Tailwind, побайтно (визуально ничего не меняется).
 * Для тёмных тем (dark / high-contrast / blue) пастельные фоны превращаются в тёмные «тинты»
 * того же оттенка, а тёмные тексты 600–950 — в светлые. Сплошные заливки (400–900 в `bg-*`) и
 * светлые тексты (50–500) не трогаем: на них стоит белый/тёмный текст по замыслу.
 */
import colors from 'tailwindcss/colors.js';

export const HUES = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
/** Оттенки, которые адаптируются по теме, по типу свойства. */
const BG_THEMED = [50, 100, 200, 300];
const FG_THEMED = [600, 700, 800, 900, 950];
const BD_THEMED = [100, 200, 300];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const channels = (hex) => hexToRgb(hex).join(' ');

function mix(hexA, hexB, ratioA) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return a.map((v, i) => Math.round(v * ratioA + b[i] * (1 - ratioA))).join(' ');
}

const ref = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/* ───────────────────────── Нейтрали (stone) ───────────────────────── */

/**
 * Нейтральная рампа по темам. Ключи — оттенки stone.
 * bg: поверхности, fg: текст, bd: границы.
 */
const STONE_LIGHT = colors.stone;

const STONE_THEMES = {
  dark: {
    bg: { 50: '#1a1a1e', 100: '#222228', 200: '#2c2c34', 300: '#383842', 400: '#4a4a56', 500: '#6b6a78' },
    fg: { 300: '#b4b2c0', 400: '#9b99a8', 500: '#a9a7b6', 600: '#c4c2ce', 700: '#d3d1dc', 800: '#e4e3ea', 900: '#f4f3f7', 950: '#f4f3f7' },
    bd: { 100: '#2a2a32', 200: '#34343e', 300: '#42424e', 400: '#565664', 500: '#707080' },
  },
  'high-contrast': {
    bg: { 50: '#0a0a0a', 100: '#121212', 200: '#1a1a1a', 300: '#242424', 400: '#3a3a3a', 500: '#5a5a00' },
    fg: { 300: '#f5e000', 400: '#f5e000', 500: '#ffff00', 600: '#ffff00', 700: '#ffff00', 800: '#ffff00', 900: '#ffff00', 950: '#ffff00' },
    bd: { 100: '#6e6e00', 200: '#8a8a00', 300: '#a8a800', 400: '#c8c800', 500: '#e6e600' },
  },
  blue: {
    bg: { 50: '#0f2137', 100: '#152a45', 200: '#1a3354', 300: '#214066', 400: '#2d5080', 500: '#4a6d99' },
    fg: { 300: '#b6c4d6', 400: '#a8b8cc', 500: '#bac7d8', 600: '#cbd5e1', 700: '#dbe3ee', 800: '#e8eef6', 900: '#f8fafc', 950: '#f8fafc' },
    bd: { 100: '#1c3350', 200: '#254060', 300: '#2f5075', 400: '#40688f', 500: '#5b82ab' },
  },
  sepia: {
    bg: { 50: '#fdf8f0', 100: '#f3ead9', 200: '#e8dcc4', 300: '#d9c9ab', 400: '#bfa985', 500: '#a08a68' },
    fg: { 300: '#b79f86', 400: '#9a7f68', 500: '#7f624e', 600: '#6b4c3b', 700: '#5a4132', 800: '#4a3628', 900: '#3d2b1f', 950: '#2e2016' },
    bd: { 100: '#eadfca', 200: '#e0d2b8', 300: '#cfbd9c', 400: '#b8a283', 500: '#9a8567' },
  },
};

/** Базовая поверхность темы (под неё подмешиваются тинты статусных цветов). */
const BASE_SURFACE = {
  dark: '#1a1a1e',
  'high-contrast': '#0a0a0a',
  blue: '#0f2137',
};

/* Доля насыщенного оттенка в тинте. */
const BG_TINT = { 50: 0.12, 100: 0.18, 200: 0.27, 300: 0.4 };
const BD_TINT = { 100: 0.32, 200: 0.45, 300: 0.6 };
/** Какой светлый оттенок используется вместо тёмного текста. */
const FG_FLIP = { 600: 400, 700: 300, 800: 300, 900: 200, 950: 100 };

function huePalette(hue) {
  return colors[hue];
}

/* ───────────────────────── Палитры для theme.* ───────────────────────── */

function buildFamily(kind, themed) {
  const out = {};
  for (const hue of HUES) {
    const scale = {};
    for (const s of SHADES) {
      scale[s] = themed.includes(s) ? ref(`${kind}-${hue}-${s}`) : huePalette(hue)[s];
    }
    out[hue] = scale;
  }
  const stone = {};
  for (const s of SHADES) {
    const themedStone = {
      bg: [50, 100, 200, 300, 400, 500],
      fg: [300, 400, 500, 600, 700, 800, 900, 950],
      bd: [100, 200, 300, 400, 500],
    }[kind];
    stone[s] = themedStone.includes(s) ? ref(`${kind}-stone-${s}`) : STONE_LIGHT[s];
  }
  out.stone = stone;
  return out;
}

export const bgPalette = buildFamily('bg', BG_THEMED);
export const fgPalette = buildFamily('fg', FG_THEMED);
export const bdPalette = buildFamily('bd', BD_THEMED);

/* ───────────────────────── Значения переменных по темам ───────────────────────── */

function lightVars() {
  const vars = {};
  for (const hue of HUES) {
    for (const s of BG_THEMED) vars[`--bg-${hue}-${s}`] = channels(huePalette(hue)[s]);
    for (const s of FG_THEMED) vars[`--fg-${hue}-${s}`] = channels(huePalette(hue)[s]);
    for (const s of BD_THEMED) vars[`--bd-${hue}-${s}`] = channels(huePalette(hue)[s]);
  }
  for (const s of [50, 100, 200, 300, 400, 500]) vars[`--bg-stone-${s}`] = channels(STONE_LIGHT[s]);
  for (const s of [300, 400, 500, 600, 700, 800, 900, 950]) vars[`--fg-stone-${s}`] = channels(STONE_LIGHT[s]);
  for (const s of [100, 200, 300, 400, 500]) vars[`--bd-stone-${s}`] = channels(STONE_LIGHT[s]);
  return vars;
}

function stoneVars(theme) {
  const t = STONE_THEMES[theme];
  const vars = {};
  for (const [s, hex] of Object.entries(t.bg)) vars[`--bg-stone-${s}`] = channels(hex);
  for (const [s, hex] of Object.entries(t.fg)) vars[`--fg-stone-${s}`] = channels(hex);
  for (const [s, hex] of Object.entries(t.bd)) vars[`--bd-stone-${s}`] = channels(hex);
  return vars;
}

function darkHueVars(theme) {
  const base = BASE_SURFACE[theme];
  const vars = {};
  for (const hue of HUES) {
    const p = huePalette(hue);
    for (const s of BG_THEMED) vars[`--bg-${hue}-${s}`] = mix(p[500], base, BG_TINT[s]);
    for (const s of FG_THEMED) vars[`--fg-${hue}-${s}`] = channels(p[FG_FLIP[s]]);
    for (const s of BD_THEMED) vars[`--bd-${hue}-${s}`] = mix(p[500], base, BD_TINT[s]);
  }
  return vars;
}

/** Вариант для высокого контраста: статусные тексты ярче, границы заметнее. */
function highContrastOverrides() {
  const vars = {};
  for (const hue of HUES) {
    const p = huePalette(hue);
    for (const s of FG_THEMED) vars[`--fg-${hue}-${s}`] = channels(p[300]);
    for (const s of BD_THEMED) vars[`--bd-${hue}-${s}`] = channels(p[400]);
  }
  return vars;
}

/** Светлая «сепия»: пастели чуть теплее и приглушённее. */
function sepiaHueVars() {
  const vars = {};
  const warm = '#f5ecdc';
  for (const hue of HUES) {
    const p = huePalette(hue);
    for (const s of BG_THEMED) vars[`--bg-${hue}-${s}`] = mix(p[s], warm, 0.78);
    for (const s of BD_THEMED) vars[`--bd-${hue}-${s}`] = mix(p[s], '#cdbb9a', 0.7);
  }
  return vars;
}

/**
 * Tailwind-плагин: кладёт переменные в @layer base.
 * Селекторы — по тем же признакам, что и index.css (`data-color-theme` на <html>).
 */
export function themePalettePlugin({ addBase }) {
  addBase({
    ':root': lightVars(),
    "html[data-color-theme='sepia'], html.theme-sepia": {
      ...stoneVars('sepia'),
      ...sepiaHueVars(),
    },
    "html[data-color-theme='dark'], html.dark": {
      ...stoneVars('dark'),
      ...darkHueVars('dark'),
    },
    "html[data-color-theme='high-contrast']": {
      ...stoneVars('high-contrast'),
      ...darkHueVars('high-contrast'),
      ...highContrastOverrides(),
    },
    "html[data-color-theme='blue']": {
      ...stoneVars('blue'),
      ...darkHueVars('blue'),
    },
  });
}
