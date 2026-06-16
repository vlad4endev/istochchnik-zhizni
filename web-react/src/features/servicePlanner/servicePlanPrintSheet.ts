/** Экспорт программы служения в PDF — A4, время + блок, перенос только при переполнении. */

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

export type ServicePlanPrintBroadcastAssignment = {
  role_name: string;
  member_name: string;
};

export type ServicePlanPrintPayload = {
  documentTitle: string;
  heading: string;
  dateLine: string;
  startTime: string;
  totalMinutes: number;
  leader: string | null;
  preacher: string | null;
  broadcastAssignments: ServicePlanPrintBroadcastAssignment[];
  baseFontPx: number;
  rows: ServicePlanPrintRow[];
};

const PDF_PAGE_WIDTH_PX = 794;
const PDF_PAGE_HEIGHT_PX = 1123;
const PDF_SHEET_PADDING_Y_PX = 40;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Стабильный читаемый кегль; переполнение уходит на следующую страницу, а не сжимается. */
export function resolveServicePlanPdfFontPx(
  rows: ServicePlanPrintRow[],
  broadcastCount = 0,
): number {
  let units = 4.2;
  if (broadcastCount > 0) units += 1.15 + Math.min(broadcastCount, 14) * 0.34;
  for (const r of rows) {
    if (r.type === 'separator') {
      units += 1.05;
      continue;
    }
    units += 1.15;
    units += Math.min(r.details.length, 5) * 0.32;
    units += Math.max(0, Math.ceil(r.title.length / 58) - 1) * 0.38;
  }
  if (units <= 34) return 13;
  if (units <= 42) return 12.5;
  return 12;
}

function buildRowsHtml(rows: ServicePlanPrintRow[], withRowIndex = false): string {
  return rows
    .map((r, index) => {
      const rowAttr = withRowIndex ? ` data-row-index="${index}"` : '';
      if (r.type === 'separator') {
        return `<tr class="sep"${rowAttr}><td colspan="2">${escapeHtml(r.label)}</td></tr>`;
      }
      const details =
        r.details.length > 0
          ? `<div class="details">${r.details.map((d) => `<div>${escapeHtml(d)}</div>`).join('')}</div>`
          : '';
      const sub = r.subtitle ? `<div class="sub">${escapeHtml(r.subtitle)}</div>` : '';
      return `<tr${rowAttr}>
        <td class="t-time">${escapeHtml(r.time)}</td>
        <td class="t-title">
          <div class="title-main">${escapeHtml(r.title)}</div>
          ${sub}
          ${details}
        </td>
      </tr>`;
    })
    .join('');
}

function buildSheetStyles(baseFontPx: number): string {
  const fsSm = Math.max(9.5, baseFontPx - 1);
  const fsXs = Math.max(9, baseFontPx - 1.75);
  const fsH = Math.min(26, baseFontPx + 11);

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
      padding: 22px 28px 18px;
      background: #fff;
      color: #0c0a09;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
    }
    h1 {
      font-size: var(--fs-h);
      font-weight: 800;
      margin: 0 0 6px;
      letter-spacing: -0.02em;
      line-height: 1.12;
    }
    .meta {
      font-size: var(--fs-sm);
      color: #44403c;
      margin-bottom: 10px;
      line-height: 1.4;
      font-weight: 500;
    }
    .roles {
      font-size: var(--fs-sm);
      color: #292524;
      margin: 0 0 10px;
      font-weight: 700;
      line-height: 1.35;
    }
    .page-continue {
      font-size: var(--fs-sm);
      color: #78716c;
      margin: 0 0 10px;
      font-weight: 700;
      line-height: 1.35;
    }
    .broadcast {
      margin: 0 0 12px;
      padding: 8px 10px 9px;
      background: #f5f5f4;
      border-radius: 8px;
      border: 1px solid #e7e5e4;
    }
    .broadcast-title {
      font-size: var(--fs-xs);
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #57534e;
      margin-bottom: 6px;
    }
    .broadcast-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 16px;
    }
    .broadcast-item {
      font-size: var(--fs-xs);
      line-height: 1.32;
      min-width: 0;
    }
    .broadcast-role {
      font-weight: 700;
      color: #78716c;
    }
    .broadcast-name {
      font-weight: 800;
      color: #1c1917;
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
      letter-spacing: 0.06em;
      color: #57534e;
      border-bottom: 2.5px solid #d6d3d1;
      padding: 5px 8px 7px 0;
      font-weight: 800;
    }
    tbody td {
      vertical-align: top;
      padding: 6px 8px 6px 0;
      border-bottom: 1px solid #e7e5e4;
    }
    .t-time {
      width: 14%;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      font-size: calc(var(--fs) + 1px);
      color: #1c1917;
    }
    .t-title { width: 86%; }
    .title-main {
      font-weight: 800;
      line-height: 1.28;
      font-size: calc(var(--fs) + 0.5px);
    }
    .sub {
      font-size: var(--fs-xs);
      color: #78716c;
      margin-top: 3px;
      font-weight: 600;
    }
    .details {
      font-size: var(--fs-xs);
      color: #57534e;
      margin-top: 4px;
      line-height: 1.38;
    }
    .details div + div { margin-top: 2px; }
    tr.sep td {
      font-weight: 800;
      text-align: center;
      padding: 8px 6px;
      background: #f5f5f4;
      border-bottom: 1px solid #d6d3d1;
      font-size: calc(var(--fs) + 1px);
      letter-spacing: 0.02em;
    }
    .footer {
      margin-top: 10px;
      font-size: var(--fs-xs);
      color: #a8a29e;
      text-align: center;
    }
  `;
}

function buildBroadcastHtml(assignments: ServicePlanPrintBroadcastAssignment[]): string {
  if (assignments.length === 0) return '';
  const items = assignments
    .map(
      (a) =>
        `<div class="broadcast-item"><span class="broadcast-role">${escapeHtml(a.role_name)}</span> — <span class="broadcast-name">${escapeHtml(a.member_name)}</span></div>`,
    )
    .join('');
  return `<div class="broadcast" data-pdf-broadcast>
    <div class="broadcast-title">Участники трансляции</div>
    <div class="broadcast-list">${items}</div>
  </div>`;
}

function buildFullHeaderHtml(payload: ServicePlanPrintPayload): string {
  const leaderLine =
    payload.leader || payload.preacher
      ? `<div class="roles">${[
          payload.leader ? `Ведущий: ${escapeHtml(payload.leader)}` : '',
          payload.preacher ? `Проповедник: ${escapeHtml(payload.preacher)}` : '',
        ]
          .filter(Boolean)
          .join(' · ')}</div>`
      : '';

  return `<div data-pdf-header>
    <h1>${escapeHtml(payload.heading)}</h1>
    <div class="meta">${escapeHtml(payload.dateLine)} · начало ${escapeHtml(payload.startTime)} · всего ${payload.totalMinutes} мин</div>
    ${leaderLine}
    ${buildBroadcastHtml(payload.broadcastAssignments)}
  </div>`;
}

type PdfPageOptions = {
  pageIndex: number;
  pageCount: number;
  rows: ServicePlanPrintRow[];
};

function buildPdfPageHtml(payload: ServicePlanPrintPayload, opts: PdfPageOptions): string {
  const isFirst = opts.pageIndex === 0;
  const isLast = opts.pageIndex === opts.pageCount - 1;

  const header = isFirst
    ? buildFullHeaderHtml(payload)
    : `<p class="page-continue">${escapeHtml(payload.heading)} · стр. ${opts.pageIndex + 1} из ${opts.pageCount}</p>`;

  const footer = isLast ? `<p class="footer" data-pdf-footer>План служения · Источник жизни</p>` : '';

  return `<style>${buildSheetStyles(payload.baseFontPx)}</style>
    <div class="pdf-sheet">
      ${header}
      <table>
        <thead>
          <tr>
            <th class="t-time">Время</th>
            <th class="t-title">Блок</th>
          </tr>
        </thead>
        <tbody>${buildRowsHtml(opts.rows)}</tbody>
      </table>
      ${footer}
    </div>`;
}

function buildMeasureHtml(payload: ServicePlanPrintPayload): string {
  return `<style>${buildSheetStyles(payload.baseFontPx)}</style>
    <div class="pdf-sheet">
      ${buildFullHeaderHtml(payload)}
      <table>
        <thead>
          <tr>
            <th class="t-time">Время</th>
            <th class="t-title">Блок</th>
          </tr>
        </thead>
        <tbody>${buildRowsHtml(payload.rows, true)}</tbody>
      </table>
      <p class="footer" data-pdf-footer>План служения · Источник жизни</p>
    </div>`;
}

function measureHeight(el: Element | null | undefined): number {
  return el instanceof HTMLElement ? el.offsetHeight : 0;
}

function paginateRowsByMeasurement(payload: ServicePlanPrintPayload, host: HTMLElement): ServicePlanPrintRow[][] {
  if (payload.rows.length === 0) return [[]];

  host.innerHTML = buildMeasureHtml(payload);
  const sheet = host.querySelector('.pdf-sheet');
  if (!(sheet instanceof HTMLElement)) return [payload.rows];

  const headerH = measureHeight(host.querySelector('[data-pdf-header]'));
  const theadH = measureHeight(host.querySelector('thead'));
  const footerH = measureHeight(host.querySelector('[data-pdf-footer]'));
  const contHeaderEl = document.createElement('p');
  contHeaderEl.className = 'page-continue';
  contHeaderEl.textContent = `${payload.heading} · стр. 2 из 2`;
  sheet.prepend(contHeaderEl);
  const contHeaderH = contHeaderEl.offsetHeight;
  contHeaderEl.remove();

  const rowEls = Array.from(host.querySelectorAll('tbody tr[data-row-index]'));
  const rowHeights = rowEls.map((tr) => (tr instanceof HTMLElement ? tr.offsetHeight : 0));

  const pageBodyBudget = (pageIndex: number, includeFooter: boolean): number => {
    const headerPart = pageIndex === 0 ? headerH : contHeaderH;
    const footerPart = includeFooter ? footerH : 0;
    return PDF_PAGE_HEIGHT_PX - PDF_SHEET_PADDING_Y_PX - headerPart - theadH - footerPart;
  };

  const chunks: number[][] = [];
  let current: number[] = [];
  let used = 0;
  let pageIndex = 0;

  for (let i = 0; i < payload.rows.length; i++) {
    const rowH = rowHeights[i] ?? 0;
    const budget = pageBodyBudget(pageIndex, false);

    if (current.length > 0 && used + rowH > budget) {
      chunks.push(current);
      current = [i];
      used = rowH;
      pageIndex += 1;
      continue;
    }

    current.push(i);
    used += rowH;
  }

  if (current.length > 0) chunks.push(current);

  while (chunks.length > 0) {
    const lastIndex = chunks.length - 1;
    const lastChunk = chunks[lastIndex] ?? [];
    const lastBody = lastChunk.reduce((sum, idx) => sum + (rowHeights[idx] ?? 0), 0);
    const lastBudget = pageBodyBudget(lastIndex, true);
    if (lastBody <= lastBudget || lastChunk.length <= 1) break;

    const movedIdx = lastChunk.pop();
    if (movedIdx == null) break;
    if (chunks.length === lastIndex + 1) {
      chunks.push([movedIdx]);
    } else {
      chunks[lastIndex + 1] = [movedIdx, ...(chunks[lastIndex + 1] ?? [])];
    }
  }

  return chunks.map((indices) => indices.map((idx) => payload.rows[idx]!));
}

async function renderPageToPdf(
  doc: jsPDF,
  host: HTMLElement,
  payload: ServicePlanPrintPayload,
  opts: PdfPageOptions,
  pageIndex: number,
): Promise<void> {
  host.innerHTML = buildPdfPageHtml(payload, opts);
  const sheet = host.querySelector('.pdf-sheet');
  if (!(sheet instanceof HTMLElement)) {
    throw new Error('Не удалось собрать макет PDF');
  }

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

  const pageWidthMm = 210;
  const imgData = canvas.toDataURL('image/jpeg', 0.94);
  if (pageIndex > 0) doc.addPage();
  const imgHeightMm = (canvas.height * pageWidthMm) / canvas.width;
  doc.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, imgHeightMm);
}

/**
 * Формирует PDF и сразу скачивает файл. Вторая страница — только при реальном переполнении.
 */
export async function downloadServicePlanPdf(payload: ServicePlanPrintPayload, fileName: string): Promise<void> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-14000px;top:0;pointer-events:none;opacity:0;z-index:-1;';
  document.body.appendChild(host);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  try {
    const pageChunks = paginateRowsByMeasurement(payload, host);
    const pageCount = pageChunks.length;

    for (let i = 0; i < pageCount; i++) {
      await renderPageToPdf(
        doc,
        host,
        payload,
        {
          pageIndex: i,
          pageCount,
          rows: pageChunks[i] ?? [],
        },
        i,
      );
    }

    const out = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    doc.save(out);
  } finally {
    document.body.removeChild(host);
  }
}
