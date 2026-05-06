/** Печать программы служения на одном листе A4 (через диалог печати → «Сохранить как PDF»). */

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Грубая оценка «веса» строк для подбора кегля под один лист A4. */
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

function buildPrintHtml(payload: ServicePlanPrintPayload): string {
  const { baseFontPx } = payload;
  const rowsHtml = payload.rows
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

  const leaderLine =
    payload.leader || payload.preacher
      ? `<div class="roles">${[payload.leader ? `Ведущий: ${escapeHtml(payload.leader)}` : '', payload.preacher ? `Проповедник: ${escapeHtml(payload.preacher)}` : '']
          .filter(Boolean)
          .join(' · ')}</div>`
      : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(payload.documentTitle)}</title>
  <style>
    :root {
      --fs: ${baseFontPx}px;
      --fs-sm: ${Math.max(8, baseFontPx - 1.5)}px;
      --fs-xs: ${Math.max(7.5, baseFontPx - 2.5)}px;
      --fs-h: ${Math.min(22, baseFontPx + 9)}px;
    }
    @page { size: A4 portrait; margin: 6mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
      color: #0c0a09;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar{
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: rgba(255,255,255,0.92);
      border-bottom: 1px solid #e7e5e4;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .toolbar button{
      appearance: none;
      border: 1px solid #d6d3d1;
      background: #0c4a6e;
      color: #fff;
      border-radius: 10px;
      padding: 8px 12px;
      font-weight: 800;
      font-size: 14px;
      cursor: pointer;
      white-space: nowrap;
    }
    .toolbar button:active{ transform: translateY(1px); }
    .toolbar .hint{
      font-size: 12px;
      color: #57534e;
      line-height: 1.2;
    }
    #sheet { padding: 0 1mm 2mm; max-width: 100%; }
    h1 {
      font-size: var(--fs-h);
      font-weight: 800;
      margin: 0 0 2px;
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
      margin: 4px 0 10px;
      font-weight: 600;
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
      padding: 3px 5px 5px 0;
      font-weight: 800;
    }
    tbody td {
      vertical-align: top;
      padding: 4px 5px 4px 0;
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
      padding: 6px 4px;
      background: #f5f5f4;
      border-bottom: 1px solid #e7e5e4;
      font-size: calc(var(--fs) + 0.5px);
    }
    .footer {
      margin-top: 8px;
      font-size: var(--fs-xs);
      color: #a8a29e;
      text-align: center;
    }
    @media print {
      body { background: #fff; }
      #sheet { padding: 0; }
      .toolbar { display: none; }
    }
  </style>
</head>
<body>
  <div class="toolbar" role="toolbar" aria-label="Действия печати">
    <button type="button" id="printBtn">Печать / PDF</button>
    <span class="hint">Если нужен файл: в диалоге печати выберите «Сохранить как PDF».</span>
  </div>
  <div id="sheet">
    <h1>${escapeHtml(payload.heading)}</h1>
    <div class="meta">${escapeHtml(payload.dateLine)} · начало ${escapeHtml(payload.startTime)} · всего ${payload.totalMinutes} мин</div>
    ${leaderLine}
    <table>
      <thead>
        <tr>
          <th class="t-time">Время</th>
          <th class="t-title">Блок</th>
          <th class="t-min">Мин</th>
          <th class="t-who">Ответственный</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p class="footer">План служения · Источник жизни. В диалоге печати выберите принтер «Сохранить как PDF», если нужен файл.</p>
  </div>
  <script>
    (function () {
      function isMobile() {
        try {
          return /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent || '');
        } catch (e) {
          return false;
        }
      }
      function fitOnePage() {
        var el = document.getElementById('sheet');
        if (!el) return;
        var a4hPx = (297 - 12) * (96 / 25.4);
        var h = el.getBoundingClientRect().height;
        var s = h > a4hPx * 0.94 ? (a4hPx * 0.94) / h : 1;
        if (s < 0.68) s = 0.68;
        if (s < 1) {
          el.style.transform = 'scale(' + s + ')';
          el.style.transformOrigin = 'top left';
          el.style.width = (100 / s) + '%';
        }
      }
      window.addEventListener('load', function () {
        fitOnePage();
        var btn = document.getElementById('printBtn');
        if (btn) btn.addEventListener('click', function () { window.print(); });
        // На десктопе можно сразу открыть печать. На мобилке часто блокируется — оставляем предпросмотр.
        if (!isMobile()) setTimeout(function () { window.print(); }, 160);
      });
    })();
  </script>
</body>
</html>`;
}

/**
 * Открывает окно с таблицей программы и вызывает печать.
 * @returns false если браузер заблокировал всплывающее окно
 */
export function openServicePlanA4PrintSheet(payload: ServicePlanPrintPayload): boolean {
  const w = window.open('about:blank', '_blank', 'noopener,noreferrer,width=900,height=1100');
  if (!w) return false;
  const html = buildPrintHtml(payload);
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    w.location.replace(url);
    // Даем вкладке загрузиться; после этого URL можно освобождать.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    // Fallback: старые браузеры / webview
    const doc = w.document;
    doc.open();
    doc.write(html);
    doc.close();
  }
  return true;
}
