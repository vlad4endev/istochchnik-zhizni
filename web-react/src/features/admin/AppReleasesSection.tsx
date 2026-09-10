import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { FaAndroid } from 'react-icons/fa';
import { LuDownload, LuLink2, LuPlus, LuTrash2, LuUpload } from 'react-icons/lu';

import {
  apiErrorMessage,
  createAdminAppRelease,
  deleteAdminAppRelease,
  fetchAdminAppReleases,
  patchAdminAppRelease,
  type AppReleaseItem,
} from './api';

const Q_RELEASES = ['admin', 'app-releases'] as const;

function fieldClass() {
  return (
    'w-full rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20'
  );
}

function btnPrimary(c = '') {
  return `inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-50 ${c}`;
}

function btnSecondary(c = '') {
  return `inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 disabled:opacity-50 ${c}`;
}

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatRuDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

type FormState = {
  version_name: string;
  version_code: string;
  title: string;
  notes: string;
  download_url: string;
  is_active: boolean;
  apk: File | null;
};

const EMPTY_FORM: FormState = {
  version_name: '',
  version_code: '',
  title: '',
  notes: '',
  download_url: '',
  is_active: true,
  apk: null,
};

export function AppReleasesSection() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const listQ = useQuery({
    queryKey: Q_RELEASES,
    queryFn: fetchAdminAppReleases,
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  const createMut = useMutation({
    mutationFn: () => {
      const codeRaw = form.version_code.trim();
      const version_code = codeRaw === '' ? null : Number(codeRaw);
      if (codeRaw !== '' && !Number.isFinite(version_code)) {
        throw new Error('Некорректный код версии');
      }
      if (!form.apk && !form.download_url.trim()) {
        throw new Error('Загрузите APK или укажите ссылку на сборку');
      }
      return createAdminAppRelease({
        version_name: form.version_name.trim(),
        version_code,
        title: form.title.trim(),
        notes: form.notes.trim(),
        download_url: form.download_url.trim(),
        is_active: form.is_active,
        apk: form.apk,
      });
    },
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Релиз опубликован. Виджет на главной покажет эту сборку.' });
      setForm(EMPTY_FORM);
      setShowForm(false);
      if (fileRef.current) fileRef.current.value = '';
      void qc.invalidateQueries({ queryKey: Q_RELEASES });
      void qc.invalidateQueries({ queryKey: ['app-release-latest'] });
    },
    onError: (e) => {
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось создать релиз') });
    },
  });

  const patchMut = useMutation({
    mutationFn: (args: { id: number; is_active: boolean }) =>
      patchAdminAppRelease(args.id, { is_active: args.is_active }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: Q_RELEASES });
      void qc.invalidateQueries({ queryKey: ['app-release-latest'] });
    },
    onError: (e) => {
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось обновить релиз') });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAdminAppRelease(id),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Релиз удалён' });
      void qc.invalidateQueries({ queryKey: Q_RELEASES });
      void qc.invalidateQueries({ queryKey: ['app-release-latest'] });
    },
    onError: (e) => {
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось удалить релиз') });
    },
  });

  const items = listQ.data ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-stone-200/80 bg-gradient-to-br from-[#E8F5E9] via-white to-stone-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#3DDC84] text-[#073042]">
            <FaAndroid className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-extrabold text-stone-900">Android-релизы</h3>
            <p className="mt-1 text-sm font-medium leading-relaxed text-stone-600">
              Загрузите APK или укажите ссылку на сборку. На главной появится виджет скачивания, пока
              есть активный релиз со ссылкой. Новый активный релиз заменяет предыдущий в виджете.
            </p>
          </div>
          <button
            type="button"
            className={btnPrimary('shrink-0 text-xs')}
            onClick={() => {
              setShowForm((v) => !v);
              setNote(null);
            }}
          >
            <LuPlus className="h-4 w-4" aria-hidden />
            {showForm ? 'Скрыть' : 'Новый релиз'}
          </button>
        </div>
      </section>

      {note ? (
        <p
          className={
            note.type === 'ok'
              ? 'rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800'
              : 'rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700'
          }
        >
          {note.text}
        </p>
      ) : null}

      {showForm ? (
        <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
              Версия (например 1.2.0)
              <input
                className={`${fieldClass()} mt-1.5`}
                value={form.version_name}
                onChange={(e) => setForm((f) => ({ ...f, version_name: e.target.value }))}
                placeholder="1.0.0"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
              Код версии (versionCode)
              <input
                className={`${fieldClass()} mt-1.5`}
                inputMode="numeric"
                value={form.version_code}
                onChange={(e) => setForm((f) => ({ ...f, version_code: e.target.value }))}
                placeholder="10"
              />
            </label>
          </div>
          <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
            Заголовок
            <input
              className={`${fieldClass()} mt-1.5`}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Полноценное приложение Android"
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
            Заметки к релизу
            <textarea
              className={`${fieldClass()} mt-1.5 min-h-[80px]`}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Что нового в этой сборке…"
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
            Ссылка на APK (если файл не загружаете)
            <div className="relative mt-1.5">
              <LuLink2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                className={`${fieldClass()} pl-9`}
                value={form.download_url}
                onChange={(e) => setForm((f) => ({ ...f, download_url: e.target.value }))}
                placeholder="https://…/app-release.apk"
              />
            </div>
          </label>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Или файл APK</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                className="sr-only"
                id="admin-apk-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setForm((f) => ({ ...f, apk: file }));
                }}
              />
              <label htmlFor="admin-apk-upload" className={`${btnSecondary()} cursor-pointer`}>
                <LuUpload className="h-4 w-4" aria-hidden />
                Выбрать APK
              </label>
              {form.apk ? (
                <span className="text-sm font-medium text-stone-700">
                  {form.apk.name} ({formatBytes(form.apk.size)})
                </span>
              ) : (
                <span className="text-sm text-stone-500">Файл не выбран</span>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary"
            />
            Активен (показывать в виджете, если это самый новый активный релиз)
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              className={btnPrimary()}
              disabled={createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? 'Публикация…' : 'Опубликовать'}
            </button>
            <button
              type="button"
              className={btnSecondary()}
              disabled={createMut.isPending}
              onClick={() => {
                setForm(EMPTY_FORM);
                setShowForm(false);
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              Отмена
            </button>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-stone-800">Список релизов</h3>
        {listQ.isLoading ? (
          <p className="text-sm text-stone-500">Загрузка…</p>
        ) : null}
        {listQ.isError ? (
          <p className="text-sm font-semibold text-red-600">
            {apiErrorMessage(listQ.error, 'Не удалось загрузить релизы')}
          </p>
        ) : null}
        {!listQ.isLoading && items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm font-medium text-stone-500">
            Релизов пока нет — виджет на главной скрыт.
          </p>
        ) : null}
        <ul className="space-y-2">
          {items.map((item) => (
            <ReleaseRow
              key={item.id}
              item={item}
              busy={patchMut.isPending || deleteMut.isPending}
              onToggleActive={() =>
                patchMut.mutate({ id: item.id, is_active: !item.is_active })
              }
              onDelete={() => {
                if (window.confirm(`Удалить релиз ${item.version_name || `#${item.id}`}?`)) {
                  deleteMut.mutate(item.id);
                }
              }}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function ReleaseRow({
  item,
  busy,
  onToggleActive,
  onDelete,
}: {
  item: AppReleaseItem;
  busy: boolean;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-extrabold text-stone-900">
            {item.version_name || item.title || `Релиз #${item.id}`}
          </span>
          {item.version_code != null ? (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-600">
              code {item.version_code}
            </span>
          ) : null}
          <span
            className={
              item.is_active
                ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800'
                : 'rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-bold text-stone-600'
            }
          >
            {item.is_active ? 'Активен' : 'Выключен'}
          </span>
        </div>
        {item.title && item.version_name ? (
          <p className="mt-0.5 truncate text-sm font-medium text-stone-600">{item.title}</p>
        ) : null}
        <p className="mt-1 truncate text-xs text-stone-500">
          {formatRuDate(item.created_at)}
          {item.file_name ? ` · ${item.file_name} (${formatBytes(item.file_size_bytes)})` : ''}
        </p>
        <a
          href={item.download_url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-primary hover:underline"
        >
          <LuDownload className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{item.download_url}</span>
        </a>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" className={btnSecondary('text-xs')} disabled={busy} onClick={onToggleActive}>
          {item.is_active ? 'Выключить' : 'Включить'}
        </button>
        <button
          type="button"
          className={`${btnSecondary('text-xs text-red-700')} hover:bg-red-50`}
          disabled={busy}
          onClick={onDelete}
        >
          <LuTrash2 className="h-4 w-4" aria-hidden />
          Удалить
        </button>
      </div>
    </li>
  );
}
