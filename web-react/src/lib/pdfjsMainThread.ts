/**
 * pdfjs-dist v4 удалил опцию `disableWorker` из DocumentInitParameters.
 * Единственный способ запустить обработку в main-thread (FakeWorker) в v4 —
 * выставить globalThis.pdfjsWorker до первого вызова getDocument.
 * pdfjs проверяет это через внутренний геттер #Ts:
 *   `globalThis.pdfjsWorker?.WorkerMessageHandler || null`
 * Если WorkerMessageHandler найден — сразу уходит в _setupFakeWorker() без
 * создания Web Worker и без import(workerSrc) (что падало с пустым строкой).
 *
 * Используем динамический import чтобы:
 * 1. Не грузить ~1.5 МБ worker-кода при каждом открытии страницы.
 * 2. Vite пересохраняет chunk как .js (а не .mjs), обходя nginx-проблему MIME.
 */
let _pdfjsWorkerSetup: Promise<void> | null = null;

export function ensurePdfjsWorker(): Promise<void> {
  if ((globalThis as Record<string, unknown>).pdfjsWorker) {
    return Promise.resolve();
  }
  if (!_pdfjsWorkerSetup) {
    _pdfjsWorkerSetup = import('pdfjs-dist/build/pdf.worker.min.mjs').then((worker) => {
      (globalThis as Record<string, unknown>).pdfjsWorker = worker;
    });
  }
  return _pdfjsWorkerSetup;
}
