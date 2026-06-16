/** Экспорт программы служения в PDF (скачивание файла). */

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export type ServicePlanPrintRow =
  | { type: 'separator'; label: string }
  | {
      type: 'block';
      time: string;
      title: string;
      subtitle: string | null;
      details: string[];
      minutes: number;
      responsible: string | null;
      hiddenFromPublic: boolean;
    };

export type ServicePlanPrintPayload = {
  documentTitle: string;
  heading: string;
  dateLine: string;
  startTime: string;
  totalMinutes: number;
  leader: string | null;
  preacher: string | null;
  baseFontPx: number;
  rows: ServicePlanPrintRow[];
};

const PDF_PAGE_WIDTH_PX = 794;
const PDF_PAGE_HEIGHT_PX = 1123;
const PDF_ROW_UNITS_PER_PAGE = 24;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Грубая оценка «веса» строк для подбора кегля. */
export function estimateServicePlanPrintBaseFontPx(rows: ServicePlanPrintRow[]): number {
  let units = 0;
  for (const r of rows) {
    if (r.type === 'separator') {
      units += 1.15;
      continue;
    }
    units += 1.25;
    units += Math.min(3, r.details.length) * 0.42;
    const titleExtra = Math.max(0, Math.ceil(r.title.length / 52) - 1);
    units += titleExtra * 0.45;
    if (r.responsible && r.responsible.length > 28) units += 0.35;
  }
  const u = Math.max(units, 6);
  const px = Math.round((198 / u) * 10) / 10;
  return Math.max(8, Math.min(13.5, px));
}

/** Стабильный кегль для PDF: читаемо, без сжатия в один лист. */
export function resolveServicePlanPdfFontPx(rows: ServicePlanPrintRow[]): number {
  const compact = estimateServicePlanPrintBaseFontPx(rows);
  return Math.max(9.5, Math.min(11.5, compact));
}

function estimateRowUnits(row: ServicePlanPrintRow): number {
  if (row.type === 'separator') return 1.35;
  let units = 1.45;
  units += Math.min(row.details.length, 8) * 0.42;
  units += Math.max(0, Math.ceil(row.title.length / 46) - 1) * 0.48;
  if (row.responsible && row.responsible.length > 26) units += 0.38;
  return units;
}

function paginateRows(rows: ServicePlanPrintRow[]): ServicePlanPrintRow[][] {
  const pages: ServicePlanPrintRow[][] = [];
  let current: ServicePlanPrintRow[] = [];
  let units = 0;

  for (const row of rows) {
    const rowUnits = estimateRowUnits(row);
    if (current.length > 0 && units + rowUnits > PDF_ROW_UNITS_PER_PAGE) {
      pages.push(current);
      current = [row];
      units = rowUnits;
      continue;
    }
    current.push(row);
    units += rowUnits;
  }

  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

function buildRowsHtml(rows: ServicePlanPrintRow[]): string {
  return rows
    .map((r) => {
      if (r.type === 'separator') {
        return `<tr class="sep"><td colspan="4">${escapeHtml(r.label)}</td></tr>`;
      }
      const details =
        r.details.length > 0
          ? `<div class="details">${r.details.map((d) => `<div>${escapeHtml(d)}</div>`).join('')}</div>`
          : '';
      const sub = r.subtitle ? `<div class="sub">${escapeHtml(r.subtitle)}</div>` : '';
      const hidden = r.hiddenFromPublic ? `<div class="hidden-flag">Не в публичной ссылке</div>` : '';
      const who = r.responsible ? escapeHtml(r.responsible) : '—';
      return `<tr>
        <td class="t-time">${escapeHtml(r.time)}</td>
        <td class="t-title">
          <div class="title-main">${escapeHtml(r.title)}</div>
          ${sub}
          ${details}
          ${hidden}
        </td>
        <td class="t-min">${r.minutes}′</td>
        <td class="t-who">${who}</td>
      </tr>`;
    })
    .join('');
}

function buildSheetStyles(baseFontPx: number): string {
  const fsSm = Math.max(8, baseFontPx - 1.5);
  const fsXs = Math.max(7.5, baseFontPx - 2.5);
  const fsH = Math.min(22, baseFontPx + 9);

  return `
    :root {
      --fs: ${baseFontPx}px;
      --fs-sm: ${fsSm}px;
      --fs-xs: ${fsXs}px;
      --fs-h: ${fsH}px;
    }
    * { box-sizing: border-box; }
    .pdf-sheet {
      width: ${PDF_PAGE_WIDTH_PX}px;
      min-height: ${PDF_PAGE_HEIGHT_PX}px;
      padding: 28px 32px 24px;
      background: #fff;
      color: #0c0a09;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
    }
    h1 {
      font-size: var(--fs-h);
      font-weight: 800;
      margin: 0 0 4px;
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
    .meta {
      font-size: var(--fs-sm);
      color: #57534e;
      margin-bottom: 8px;
      line-height: 1.35;
    }
    .roles {
      font-size: var(--fs-sm);
      color: #44403c;
      margin: 4px 0 12px;
      font-weight: 600;
    }
    .page-continue {
      font-size: var(--fs-sm);
      color: #78716c;
      margin: 0 0 10px;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--fs);
    }
    thead th {
      text-align: left;
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #78716c;
      border-bottom: 2px solid #d6d3d1;
      padding: 4px 6px 6px 0;
      font-weight: 800;
    }
    tbody td {
      vertical-align: top;
      padding: 5px 6px 5px 0;
      border-bottom: 1px solid #f5f5f4;
    }
    .t-time {
      width: 12%;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      font-size: calc(var(--fs) + 0.5px);
    }
    .t-title { width: 56%; }
    .t-min {
      width: 10%;
      text-align: right;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .t-who {
      width: 22%;
      font-size: var(--fs-sm);
      color: #44403c;
      line-height: 1.25;
      word-break: break-word;
    }
    .title-main { font-weight: 800; line-height: 1.2; }
    .sub { font-size: var(--fs-xs); color: #78716c; margin-top: 2px; }
    .details { font-size: var(--fs-xs); color: #57534e; margin-top: 3px; line-height: 1.3; }
    .details div + div { margin-top: 1px; }
    .hidden-flag { font-size: calc(var(--fs-xs) - 0.5px); color: #a8a29e; font-weight: 700; margin-top: 3px; }
    tr.sep td {
      font-weight: 800;
      text-align: center;
      padding: 7px 4px;
      background: #f5f5f4;
      border-bottom: 1px solid #e7e5e4;
      font-size: calc(var(--fs) + 0.5px);
    }
    .footer {
      margin-top: 12px;
      font-size: var(--fs-xs);
      color: #a8a29e;
      text-align: center;
    }
  `;
}

type PdfPageOptions = {
  showFullHeader: boolean;
  showFooter: boolean;
  pageNum: number;
  totalPages: number;
};

function buildPdfPageHtml(payload: ServicePlanPrintPayload, rows: ServicePlanPrintRow[], opts: PdfPageOptions): string {
  const leaderLine =
    opts.showFullHeader && (payload.leader || payload.preacher)
      ? `<div class="roles">${[
          payload.leader ? `Ведущий: ${escapeHtml(payload.leader)}` : '',
          payload.preacher ? `Проповедник: ${escapeHtml(payload.preacher)}` : '',
        ]
          .filter(Boolean)
          .join(' · ')}</div>`
      : '';

  const header = opts.showFullHeader
    ? `<h1>${escapeHtml(payload.heading)}</h1>
       <div class="meta">${escapeHtml(payload.dateLine)} · начало ${escapeHtml(payload.startTime)} · всего ${payload.totalMinutes} мин</div>
       ${leaderLine}`
    : `<p class="page-continue">${escapeHtml(payload.heading)} · стр. ${opts.pageNum} из ${opts.totalPages}</p>`;

  const footer = opts.showFooter
    ? `<p class="footer">План служения · Источник жизни</p>`
    : '';

  return `<style>${buildSheetStyles(payload.baseFontPx)}</style>
    <div class="pdf-sheet">
      ${header}
      <table>
        <thead>
          <tr>
            <th class="t-time">Время</th>
            <th class="t-title">Блок</th>
            <th class="t-min">Мин</th>
            <th class="t-who">Ответственный</th>
          </tr>
        </thead>
        <tbody>${buildRowsHtml(rows)}</tbody>
      </table>
      ${footer}
    </div>`;
}

/**
 * Формирует PDF и сразу скачивает файл (без всплывающих окон и диалога печати).
 */
export async function downloadServicePlanPdf(payload: ServicePlanPrintPayload, fileName: string): Promise<void> {
  const pageChunks = paginateRows(payload.rows);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-14000px;top:0;pointer-events:none;opacity:0;z-index:-1;';
  document.body.appendChild(host);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const marginMm = 0;
  const pageWidthMm = 210;

  try {
    for (let i = 0; i < pageChunks.length; i++) {
      const rows = pageChunks[i] ?? [];
      host.innerHTML = buildPdfPageHtml(payload, rows, {
        showFullHeader: i === 0,
        showFooter: i === pageChunks.length - 1,
        pageNum: i + 1,
        totalPages: pageChunks.length,
      });

      const sheet = host.querySelector('.pdf-sheet');
      if (!(sheet instanceof HTMLElement)) {
        throw new Error('Не удалось собрать макет PDF');
      }

      sheet.style.minHeight = 'auto';
      const captureHeight = Math.min(PDF_PAGE_HEIGHT_PX, Math.max(sheet.scrollHeight + 8, 240));

      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: PDF_PAGE_WIDTH_PX,
        height: captureHeight,
        windowWidth: PDF_PAGE_WIDTH_PX,
        windowHeight: captureHeight,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.94);
      if (i > 0) doc.addPage();
      const imgHeightMm = (canvas.height * pageWidthMm) / canvas.width;
      doc.addImage(imgData, 'JPEG', marginMm, marginMm, pageWidthMm, imgHeightMm);
    }

    const out = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    doc.save(out);
  } finally {
    document.body.removeChild(host);
  }
}
