/** Экспорт программы служения в PDF — один лист A4, время + блок. */

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Подбор кегля под один лист A4 (2 колонки: время + блок). */
export function resolveServicePlanPdfFontPx(rows: ServicePlanPrintRow[]): number {
  let units = 4.2;
  for (const r of rows) {
    if (r.type === 'separator') {
      units += 1.05;
      continue;
    }
    units += 1.15;
    units += Math.min(r.details.length, 5) * 0.32;
    units += Math.max(0, Math.ceil(r.title.length / 58) - 1) * 0.38;
  }
  const px = Math.round((46 / Math.max(units, 6)) * 12.5 * 10) / 10;
  return Math.max(10.5, Math.min(15, px));
}

function buildRowsHtml(rows: ServicePlanPrintRow[]): string {
  return rows
    .map((r) => {
      if (r.type === 'separator') {
        return `<tr class="sep"><td colspan="2">${escapeHtml(r.label)}</td></tr>`;
      }
      const details =
        r.details.length > 0
          ? `<div class="details">${r.details.map((d) => `<div>${escapeHtml(d)}</div>`).join('')}</div>`
          : '';
      const sub = r.subtitle ? `<div class="sub">${escapeHtml(r.subtitle)}</div>` : '';
      const hidden = r.hiddenFromPublic ? `<div class="hidden-flag">Не в публичной ссылке</div>` : '';
      return `<tr>
        <td class="t-time">${escapeHtml(r.time)}</td>
        <td class="t-title">
          <div class="title-main">${escapeHtml(r.title)}</div>
          ${sub}
          ${details}
          ${hidden}
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
    .pdf-frame {
      width: ${PDF_PAGE_WIDTH_PX}px;
      height: ${PDF_PAGE_HEIGHT_PX}px;
      overflow: hidden;
      background: #fff;
    }
    .pdf-sheet {
      width: ${PDF_PAGE_WIDTH_PX}px;
      padding: 22px 28px 18px;
      background: #fff;
      color: #0c0a09;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
      transform-origin: top left;
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
      margin: 0 0 14px;
      font-weight: 700;
      line-height: 1.35;
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
    .hidden-flag {
      font-size: calc(var(--fs-xs) - 0.5px);
      color: #a8a29e;
      font-weight: 700;
      margin-top: 4px;
    }
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

function buildPdfSheetHtml(payload: ServicePlanPrintPayload): string {
  const leaderLine =
    payload.leader || payload.preacher
      ? `<div class="roles">${[
          payload.leader ? `Ведущий: ${escapeHtml(payload.leader)}` : '',
          payload.preacher ? `Проповедник: ${escapeHtml(payload.preacher)}` : '',
        ]
          .filter(Boolean)
          .join(' · ')}</div>`
      : '';

  return `<style>${buildSheetStyles(payload.baseFontPx)}</style>
    <div class="pdf-frame">
      <div class="pdf-sheet">
        <h1>${escapeHtml(payload.heading)}</h1>
        <div class="meta">${escapeHtml(payload.dateLine)} · начало ${escapeHtml(payload.startTime)} · всего ${payload.totalMinutes} мин</div>
        ${leaderLine}
        <table>
          <thead>
            <tr>
              <th class="t-time">Время</th>
              <th class="t-title">Блок</th>
            </tr>
          </thead>
          <tbody>${buildRowsHtml(payload.rows)}</tbody>
        </table>
        <p class="footer">План служения · Источник жизни</p>
      </div>
    </div>`;
}

function fitSheetToOnePage(sheet: HTMLElement): void {
  const naturalHeight = sheet.scrollHeight;
  const maxHeight = PDF_PAGE_HEIGHT_PX - 4;
  if (naturalHeight <= maxHeight) return;

  let scale = maxHeight / naturalHeight;
  if (scale < 0.7) scale = 0.7;
  sheet.style.transform = `scale(${scale})`;
  sheet.style.width = `${PDF_PAGE_WIDTH_PX / scale}px`;
}

/**
 * Формирует PDF на одном листе A4 и сразу скачивает файл.
 */
export async function downloadServicePlanPdf(payload: ServicePlanPrintPayload, fileName: string): Promise<void> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-14000px;top:0;pointer-events:none;opacity:0;z-index:-1;';
  document.body.appendChild(host);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidthMm = 210;
  const pageHeightMm = 297;

  try {
    host.innerHTML = buildPdfSheetHtml(payload);
    const frame = host.querySelector('.pdf-frame');
    const sheet = host.querySelector('.pdf-sheet');
    if (!(frame instanceof HTMLElement) || !(sheet instanceof HTMLElement)) {
      throw new Error('Не удалось собрать макет PDF');
    }

    fitSheetToOnePage(sheet);

    const canvas = await html2canvas(frame, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: PDF_PAGE_WIDTH_PX,
      height: PDF_PAGE_HEIGHT_PX,
      windowWidth: PDF_PAGE_WIDTH_PX,
      windowHeight: PDF_PAGE_HEIGHT_PX,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.94);
    doc.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, pageHeightMm);

    const out = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    doc.save(out);
  } finally {
    document.body.removeChild(host);
  }
}
