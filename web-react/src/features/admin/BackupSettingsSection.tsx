import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  LuCloud,
  LuDatabase,
  LuDownload,
  LuFileText,
  LuHardDrive,
  LuInfo,
  LuMessageSquare,
  LuRefreshCw,
  LuRotateCcw,
  LuSend,
  LuServer,
  LuSettings,
  LuTrash2,
  LuX,
} from 'react-icons/lu';

import {
  apiErrorMessage,
  createBackup,
  deleteBackup,
  downloadBackupArchive,
  fetchBackupDetail,
  fetchBackupList,
  fetchBackupSettings,
  patchBackupSettings,
  restoreBackup,
  sendBackupDrive,
  sendBackupTelegram,
  type BackupComponentsSummary,
  type BackupDetailView,
  type BackupLocation,
  type BackupScheduleKind,
  type BackupSettings,
  type BackupTelegramTarget,
} from './api';
import { BodyPortal } from '../../components/BodyPortal';

const Q_SETTINGS = ['admin', 'backup', 'settings'] as const;
const Q_LIST = ['admin', 'backup', 'list'] as const;

const WEEK_DAYS = [
  { id: 1, label: 'Пн' },
  { id: 2, label: 'Вт' },
  { id: 3, label: 'Ср' },
  { id: 4, label: 'Чт' },
  { id: 5, label: 'Пт' },
  { id: 6, label: 'Сб' },
  { id: 0, label: 'Вс' },
] as const;

const DEFAULT_CONFIRM = 'ВОССТАНОВИТЬ';

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

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 Б';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(2)} МБ`;
}

function formatRuDate(iso: string | null): string {
  if (!iso) return '—';
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

const SNAPSHOT_LAYERS: Array<{
  key: keyof BackupComponentsSummary | 'members';
  label: string;
  hint: string;
  Icon: typeof LuDatabase;
}> = [
  {
    key: 'database',
    label: 'База данных',
    hint: 'PostgreSQL: участники, события, настройки, переписки, студия…',
    Icon: LuDatabase,
  },
  {
    key: 'messenger_summary',
    label: 'Переписки',
    hint: 'Сообщения и чаты в дампе БД + сводка conversations',
    Icon: LuMessageSquare,
  },
  {
    key: 'uploads',
    label: 'Файлы uploads',
    hint: 'Локальные аватары, постеры, релизы, studio-листы',
    Icon: LuHardDrive,
  },
  {
    key: 'storage',
    label: 'Облачные файлы',
    hint: 'Supabase Storage: вложения чата и user-media',
    Icon: LuFileText,
  },
  {
    key: 'settings_snapshot',
    label: 'Настройки',
    hint: 'Снимок global_settings (+ полный ряд в БД)',
    Icon: LuSettings,
  },
  {
    key: 'server_snapshot',
    label: 'Сервер',
    hint: 'ОС, Node, env-ключи, хеши compose/Dockerfile',
    Icon: LuServer,
  },
];

function ComponentChips({ components }: { components: BackupComponentsSummary | null }) {
  if (!components) {
    return <span className="text-xs text-stone-400">базовый архив</span>;
  }
  const chips: Array<{ on: boolean; label: string }> = [
    { on: components.database, label: 'БД' },
    { on: components.messenger_summary, label: 'чаты' },
    { on: components.uploads, label: 'uploads' },
    {
      on: components.storage,
      label: components.storage
        ? `Storage ${components.storage_object_count}`
        : 'Storage',
    },
    { on: components.settings_snapshot, label: 'настройки' },
    { on: components.server_snapshot, label: 'сервер' },
    { on: components.secrets, label: 'secrets' },
  ];
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c.label}
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            c.on ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-400'
          }`}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

function LocationBadge({ location }: { location: BackupLocation }) {
  const label =
    location === 'drive' ? 'Google Drive' : location === 'both' ? 'Локально + Drive' : 'Локально';
  const cls =
    location === 'drive'
      ? 'bg-sky-50 text-sky-800'
      : location === 'both'
        ? 'bg-violet-50 text-violet-800'
        : 'bg-stone-100 text-stone-600';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {location !== 'local' ? <LuCloud className="h-3 w-3" /> : <LuHardDrive className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function BackupSettingsSection() {
  const qc = useQueryClient();
  const settingsQ = useQuery({
    queryKey: Q_SETTINGS,
    queryFn: fetchBackupSettings,
    refetchInterval: (q) =>
      q.state.data?.running || q.state.data?.settings.last_run_status === 'running' ? 4000 : false,
  });
  const listQ = useQuery({
    queryKey: Q_LIST,
    queryFn: fetchBackupList,
    refetchInterval: (q) => (q.state.data?.running ? 4000 : 30_000),
  });

  const [draft, setDraft] = useState<BackupSettings | null>(null);
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [sendTelegramOnCreate, setSendTelegramOnCreate] = useState(false);

  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [restoreDb, setRestoreDb] = useState(true);
  const [restoreUploads, setRestoreUploads] = useState(true);
  const [restoreSecrets, setRestoreSecrets] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restoreLog, setRestoreLog] = useState<string | null>(null);
  const [dryRunOk, setDryRunOk] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BackupDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [driveSaJson, setDriveSaJson] = useState('');
  const [clearDriveSa, setClearDriveSa] = useState(false);

  const confirmPhrase = settingsQ.data?.restore_confirm_phrase || DEFAULT_CONFIRM;

  useEffect(() => {
    if (settingsQ.data?.settings) {
      const s = settingsQ.data.settings;
      setDraft({
        ...s,
        drive_enabled: Boolean(s.drive_enabled),
        drive_folder_id: s.drive_folder_id ?? null,
        drive_delete_local_after_upload:
          typeof s.drive_delete_local_after_upload === 'boolean'
            ? s.drive_delete_local_after_upload
            : true,
        drive_retention_days: s.drive_retention_days ?? s.retention_days ?? 30,
        drive_ready: Boolean(s.drive_ready),
        drive_configured: Boolean(s.drive_configured),
        has_drive_service_account: Boolean(s.has_drive_service_account ?? s.drive_configured),
        drive_client_email_masked: s.drive_client_email_masked ?? null,
        drive_source: s.drive_source ?? null,
        drive_folder_name: s.drive_folder_name ?? null,
        last_drive_at: s.last_drive_at ?? null,
        last_drive_status: s.last_drive_status ?? null,
        last_drive_message: s.last_drive_message ?? null,
        last_drive_file_id: s.last_drive_file_id ?? null,
      });
      setSendTelegramOnCreate(Boolean(s.telegram_send));
      setClearDriveSa(false);
    }
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('no draft');
      return patchBackupSettings({
        auto_enabled: draft.auto_enabled,
        schedule_time: draft.schedule_time,
        schedule_kind: draft.schedule_kind,
        schedule_weekdays: draft.schedule_weekdays,
        timezone: draft.timezone,
        telegram_send: draft.telegram_send,
        telegram_target: draft.telegram_target,
        retention_days: draft.retention_days,
        drive_enabled: draft.drive_enabled,
        drive_folder_id: draft.drive_folder_id,
        drive_delete_local_after_upload: draft.drive_delete_local_after_upload,
        drive_retention_days: draft.drive_retention_days,
        drive_service_account_json: clearDriveSa
          ? null
          : driveSaJson.trim()
            ? driveSaJson.trim()
            : undefined,
      });
    },
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Настройки бекапа сохранены.' });
      setDriveSaJson('');
      setClearDriveSa(false);
      void qc.invalidateQueries({ queryKey: Q_SETTINGS });
      void qc.invalidateQueries({ queryKey: Q_LIST });
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить настройки.') }),
  });

  const createMut = useMutation({
    mutationFn: () => createBackup({ send_telegram: sendTelegramOnCreate }),
    onSuccess: (data) => {
      const tg = data.backup.telegram;
      const drive = data.backup.drive;
      const parts = [
        tg ? `Telegram: ${tg.message}` : null,
        drive
          ? `Drive: ${drive.message}`
          : draft?.drive_folder_id
            ? 'Drive: не выгружено — проверьте подключение и статус ниже'
            : null,
      ].filter(Boolean);
      setNote({
        type: drive && !drive.ok ? 'err' : 'ok',
        text: `Бекап создан: ${data.backup.id} (${formatBytes(data.backup.size_bytes)}).${
          parts.length ? ` ${parts.join(' · ')}` : ''
        }`,
      });
      void qc.invalidateQueries({ queryKey: Q_SETTINGS });
      void qc.invalidateQueries({ queryKey: Q_LIST });
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось создать бекап.') }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBackup(id),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Бекап удалён.' });
      void qc.invalidateQueries({ queryKey: Q_LIST });
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось удалить бекап.') }),
  });

  const sendMut = useMutation({
    mutationFn: (id: string) =>
      sendBackupTelegram(id, { telegram_target: draft?.telegram_target ?? 'admins' }),
    onSuccess: (data) => {
      setNote({ type: data.ok ? 'ok' : 'err', text: data.message });
      void qc.invalidateQueries({ queryKey: Q_SETTINGS });
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось отправить в Telegram.') }),
  });

  const driveSendMut = useMutation({
    mutationFn: (id: string) => sendBackupDrive(id),
    onSuccess: (data) => {
      setNote({ type: data.ok ? 'ok' : 'err', text: data.message });
      void qc.invalidateQueries({ queryKey: Q_SETTINGS });
      void qc.invalidateQueries({ queryKey: Q_LIST });
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось выгрузить на Google Drive.') }),
  });

  const downloadMut = useMutation({
    mutationFn: (id: string) => downloadBackupArchive(id),
    onSuccess: () => setNote({ type: 'ok', text: 'Скачивание началось.' }),
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось скачать архив.') }),
  });

  const restoreMut = useMutation({
    mutationFn: (opts: { dry_run: boolean }) => {
      if (!restoreId) throw new Error('no id');
      return restoreBackup(restoreId, {
        dry_run: opts.dry_run,
        confirm: opts.dry_run ? undefined : restoreConfirm.trim(),
        restore_db: restoreDb,
        restore_uploads: restoreUploads,
        restore_secrets: restoreSecrets,
        encrypt_passphrase: restorePassphrase.trim() || undefined,
      });
    },
    onSuccess: (data) => {
      setRestoreLog(data.log_tail || null);
      if (data.dry_run) {
        setDryRunOk(true);
        setNote({ type: 'ok', text: data.message });
      } else {
        setNote({ type: 'ok', text: data.message });
        setRestoreId(null);
        setRestoreConfirm('');
        setDryRunOk(false);
        void qc.invalidateQueries({ queryKey: Q_SETTINGS });
        void qc.invalidateQueries({ queryKey: Q_LIST });
      }
    },
    onError: (e) => {
      setDryRunOk(false);
      setNote({ type: 'err', text: apiErrorMessage(e, 'Восстановление не удалось.') });
    },
  });

  const running = Boolean(
    settingsQ.data?.running || listQ.data?.running || createMut.isPending || restoreMut.isPending,
  );
  const maxDays = draft?.max_retention_days ?? 30;

  function openRestore(id: string) {
    setRestoreId(id);
    setRestoreDb(true);
    setRestoreUploads(true);
    setRestoreSecrets(false);
    setRestoreConfirm('');
    setRestorePassphrase('');
    setRestoreLog(null);
    setDryRunOk(false);
    setNote(null);
  }

  async function openDetail(id: string) {
    setDetailId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const { detail: d } = await fetchBackupDetail(id);
      setDetail(d);
    } catch (e) {
      setDetailError(apiErrorMessage(e, 'Не удалось загрузить детали бекапа.'));
    } finally {
      setDetailLoading(false);
    }
  }

  function toggleWeekday(day: number) {
    if (!draft) return;
    const set = new Set(draft.schedule_weekdays);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    const next = [...set].sort((a, b) => a - b);
    setDraft({ ...draft, schedule_weekdays: next.length ? next : [1] });
  }

  if (settingsQ.isLoading || !draft) {
    return (
      <div className="rounded-2xl border border-stone-200/80 bg-white p-6 text-sm text-stone-600">
        Загрузка раздела резервных копий…
      </div>
    );
  }

  if (settingsQ.error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {apiErrorMessage(settingsQ.error, 'Не удалось загрузить настройки бекапа.')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {note && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            note.type === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'
          }`}
        >
          {note.text}
        </div>
      )}

      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-stone-900">
              <LuHardDrive className="h-5 w-5 text-primary" />
              Полный снимок проекта
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              Детальная резервная копия: база данных, переписки, локальные и облачные файлы,
              настройки приложения и снимок конфигурации сервера. Архив можно скачать, отправить в
              Telegram или восстановить.
            </p>
          </div>
          <button
            type="button"
            className={btnPrimary()}
            disabled={running}
            onClick={() => createMut.mutate()}
          >
            <LuRefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Выполняется…' : 'Создать полный снимок'}
          </button>
        </div>

        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SNAPSHOT_LAYERS.map(({ key, label, hint, Icon }) => (
            <li
              key={key}
              className="flex gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-3"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <div className="text-sm font-semibold text-stone-900">{label}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{hint}</p>
              </div>
            </li>
          ))}
        </ul>

        <label className="mt-4 flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary"
            checked={sendTelegramOnCreate}
            onChange={(e) => setSendTelegramOnCreate(e.target.checked)}
          />
          Сразу отправить архив в Telegram после создания
        </label>
        {draft.last_run_at && (
          <p className="mt-3 text-xs text-stone-500">
            Последний запуск: {formatRuDate(draft.last_run_at)}
            {draft.last_run_status ? ` · ${draft.last_run_status}` : ''}
            {draft.last_run_message ? ` — ${draft.last_run_message}` : ''}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-stone-900">Автобекап и Telegram</h2>
        <p className="mt-1 text-sm text-stone-600">
          Хранение не дольше {maxDays} дней — старые копии удаляются автоматически. Бот настраивается в
          разделе Telegram.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-medium text-stone-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-stone-300 text-primary"
              checked={draft.auto_enabled}
              onChange={(e) => setDraft({ ...draft, auto_enabled: e.target.checked })}
            />
            Включить автоматический бекап
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-stone-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-stone-300 text-primary"
              checked={draft.telegram_send}
              onChange={(e) => setDraft({ ...draft, telegram_send: e.target.checked })}
            />
            Отправлять автобекап в Telegram
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Время (HH:MM)</span>
            <input
              type="time"
              className={fieldClass()}
              value={draft.schedule_time}
              onChange={(e) => setDraft({ ...draft, schedule_time: e.target.value })}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Часовой пояс</span>
            <input
              className={fieldClass()}
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
              placeholder="Europe/Moscow"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Периодичность</span>
            <select
              className={fieldClass()}
              value={draft.schedule_kind}
              onChange={(e) =>
                setDraft({ ...draft, schedule_kind: e.target.value as BackupScheduleKind })
              }
            >
              <option value="daily">Ежедневно</option>
              <option value="weekly">По выбранным дням недели</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">
              Хранить дней (макс. {maxDays})
            </span>
            <input
              type="number"
              min={1}
              max={maxDays}
              className={fieldClass()}
              value={draft.retention_days}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  retention_days: Math.min(maxDays, Math.max(1, Number(e.target.value) || 1)),
                })
              }
            />
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-stone-700">Куда слать в Telegram</span>
            <select
              className={fieldClass()}
              value={draft.telegram_target}
              onChange={(e) =>
                setDraft({ ...draft, telegram_target: e.target.value as BackupTelegramTarget })
              }
            >
              <option value="admins">Личные чаты администраторов (telegram_chat_id)</option>
              <option value="default_chat">Default chat из настроек Telegram</option>
              <option value="both">Админы и default chat</option>
            </select>
            {!draft.telegram_bot_ready && (
              <span className="mt-1 block text-xs text-amber-700">
                Бот не готов: включите Telegram и укажите токен в разделе «Telegram».
              </span>
            )}
          </label>

          {draft.schedule_kind === 'weekly' && (
            <div className="sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-stone-700">Дни недели</span>
              <div className="flex flex-wrap gap-2">
                {WEEK_DAYS.map((d) => {
                  const on = draft.schedule_weekdays.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                        on ? 'bg-primary text-white' : 'bg-stone-100 text-stone-700'
                      }`}
                      onClick={() => toggleWeekday(d.id)}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className={btnPrimary()}
            disabled={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            Сохранить настройки
          </button>
        </div>

        {draft.last_telegram_message && (
          <p className="mt-3 text-xs text-stone-500">
            Telegram: {formatRuDate(draft.last_telegram_at)} — {draft.last_telegram_message}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-stone-900">
          <LuCloud className="h-5 w-5 text-primary" />
          Google Drive — основное хранилище
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Все настройки Drive задаются здесь. Как только папка подключена, каждый новый снимок
          уходит туда; локально на сервере можно не хранить копии.
        </p>

        <div
          className={`mt-3 rounded-xl px-3 py-2 text-xs ${
            draft.last_drive_status === 'error'
              ? 'bg-red-50 text-red-900'
              : draft.drive_ready
                ? 'bg-emerald-50 text-emerald-900'
                : 'bg-amber-50 text-amber-900'
          }`}
        >
          {draft.last_drive_status === 'error' && draft.last_drive_message
            ? draft.last_drive_message
            : draft.drive_ready
              ? `Подключено${draft.drive_folder_name ? `: «${draft.drive_folder_name}»` : ''}${
                  draft.drive_client_email_masked ? ` · ${draft.drive_client_email_masked}` : ''
                }. Новые снимки выгружаются автоматически.`
              : draft.has_drive_service_account
                ? 'Ключ сохранён, но папка недоступна — проверьте ID папки и шаринг на email service account (право «Редактор»).'
                : 'Не настроено: вставьте JSON ключа и ID папки, затем сохраните.'}
        </div>

        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-stone-500">
          <li>Google Cloud → IAM → Service Account → создать → скачать JSON-ключ</li>
          <li>Создайте папку на Google Drive и расшарьте её на email из ключа (право «Редактор»)</li>
          <li>Вставьте JSON и ID/ссылку папки ниже → Сохранить → Проверить</li>
        </ol>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-medium text-stone-800 sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-stone-300 text-primary"
              checked={draft.drive_enabled}
              onChange={(e) => setDraft({ ...draft, drive_enabled: e.target.checked })}
            />
            Автоматически выгружать каждый снимок на Google Drive
            <span className="font-normal text-stone-500">
              {' '}
              (включается само, когда указаны ключ и папка)
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-stone-800 sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-stone-300 text-primary"
              checked={draft.drive_delete_local_after_upload}
              onChange={(e) =>
                setDraft({ ...draft, drive_delete_local_after_upload: e.target.checked })
              }
            />
            Удалять локальную копию после успешной выгрузки (хранить только на Drive)
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-stone-700">
              ID папки Drive (или ссылка …/folders/…)
            </span>
            <input
              className={fieldClass()}
              value={draft.drive_folder_id ?? ''}
              onChange={(e) => {
                const value = e.target.value.trim() || null;
                setDraft({
                  ...draft,
                  drive_folder_id: value,
                  drive_enabled: value ? true : draft.drive_enabled,
                });
              }}
              placeholder="1AbC…xyz или https://drive.google.com/drive/folders/…"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">
              Хранить на Drive (дней, макс. {maxDays})
            </span>
            <input
              type="number"
              min={1}
              max={maxDays}
              className={fieldClass()}
              value={draft.drive_retention_days}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  drive_retention_days: Math.min(
                    maxDays,
                    Math.max(1, Number(e.target.value) || 1),
                  ),
                })
              }
            />
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-stone-700">
              Ключ service account (JSON)
              {draft.has_drive_service_account && draft.drive_client_email_masked
                ? ` — сохранён: ${draft.drive_client_email_masked}`
                : draft.has_drive_service_account
                  ? ' — ключ сохранён'
                  : ''}
            </span>
            <textarea
              className={`${fieldClass()} min-h-[100px] font-mono text-xs`}
              value={driveSaJson}
              onChange={(e) => {
                setDriveSaJson(e.target.value);
                if (e.target.value.trim()) {
                  setClearDriveSa(false);
                  setDraft((d) => (d ? { ...d, drive_enabled: true } : d));
                }
              }}
              placeholder={
                draft.has_drive_service_account
                  ? 'Ключ уже сохранён. Вставьте новый JSON только чтобы заменить его.'
                  : '{"type":"service_account","project_id":"…","private_key":"…","client_email":"…@….iam.gserviceaccount.com",…}'
              }
              spellCheck={false}
              disabled={clearDriveSa}
            />
          </label>

          {draft.has_drive_service_account && (
            <label className="flex items-center gap-2 text-sm font-medium text-red-800 sm:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-stone-300 text-red-600"
                checked={clearDriveSa}
                onChange={(e) => {
                  setClearDriveSa(e.target.checked);
                  if (e.target.checked) setDriveSaJson('');
                }}
              />
              Удалить сохранённый ключ service account при сохранении
            </label>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className={btnPrimary()}
            disabled={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            Сохранить настройки Drive
          </button>
          <button
            type="button"
            className={btnSecondary()}
            disabled={settingsQ.isFetching}
            onClick={() => {
              void qc.invalidateQueries({ queryKey: Q_SETTINGS }).then(() => {
                setNote({ type: 'ok', text: 'Статус подключения Drive обновлён.' });
              });
            }}
          >
            <LuRefreshCw className={`h-4 w-4 ${settingsQ.isFetching ? 'animate-spin' : ''}`} />
            Проверить подключение
          </button>
        </div>

        {draft.last_drive_message && (
          <p
            className={`mt-3 text-xs ${
              draft.last_drive_status === 'error'
                ? 'text-red-700'
                : draft.last_drive_status === 'skipped'
                  ? 'text-amber-700'
                  : 'text-stone-500'
            }`}
          >
            Drive: {formatRuDate(draft.last_drive_at)} — {draft.last_drive_message}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-stone-900">Сохранённые копии</h2>
          <button
            type="button"
            className={btnSecondary()}
            onClick={() => {
              void qc.invalidateQueries({ queryKey: Q_LIST });
              void qc.invalidateQueries({ queryKey: Q_SETTINGS });
            }}
          >
            Обновить список
          </button>
        </div>

        {listQ.isLoading ? (
          <p className="mt-4 text-sm text-stone-500">Загрузка…</p>
        ) : listQ.error ? (
          <p className="mt-4 text-sm text-red-700">
            {apiErrorMessage(listQ.error, 'Не удалось загрузить список.')}
          </p>
        ) : (listQ.data?.items.length ?? 0) === 0 ? (
          <p className="mt-4 text-sm text-stone-500">Пока нет бекапов. Создайте первый архив выше.</p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-100">
            {listQ.data!.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-stone-900">{item.id}</span>
                    <LocationBadge location={item.location ?? 'local'} />
                  </div>
                  <div className="text-xs text-stone-500">
                    {formatRuDate(item.created_at)} · {formatBytes(item.size_bytes)} · {item.age_days}{' '}
                    дн.
                    {item.has_archive ? ' · архив готов' : ''}
                    {item.detailed ? ' · детальный' : ''}
                    {item.drive_web_link ? (
                      <>
                        {' · '}
                        <a
                          href={item.drive_web_link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          открыть на Drive
                        </a>
                      </>
                    ) : null}
                  </div>
                  <ComponentChips components={item.components} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnSecondary()}
                    onClick={() => void openDetail(item.id)}
                  >
                    <LuInfo className="h-4 w-4" />
                    Состав
                  </button>
                  <button
                    type="button"
                    className={btnSecondary()}
                    disabled={downloadMut.isPending}
                    onClick={() => downloadMut.mutate(item.id)}
                  >
                    <LuDownload className="h-4 w-4" />
                    Скачать
                  </button>
                  <button
                    type="button"
                    className={btnSecondary('border-primary/40 text-primary')}
                    disabled={running}
                    onClick={() => openRestore(item.id)}
                  >
                    <LuRotateCcw className="h-4 w-4" />
                    Восстановить
                  </button>
                  {(item.location === 'local' || item.location === 'both') && (
                    <button
                      type="button"
                      className={btnSecondary()}
                      disabled={driveSendMut.isPending || !draft.drive_ready}
                      onClick={() => driveSendMut.mutate(item.id)}
                      title={
                        draft.drive_ready
                          ? 'Выгрузить на Google Drive'
                          : 'Сначала настройте Google Drive'
                      }
                    >
                      <LuCloud className="h-4 w-4" />
                      На Drive
                    </button>
                  )}
                  <button
                    type="button"
                    className={btnSecondary()}
                    disabled={sendMut.isPending || !draft.telegram_bot_ready}
                    onClick={() => sendMut.mutate(item.id)}
                    title={
                      draft.telegram_bot_ready ? 'Отправить в Telegram' : 'Сначала настройте Telegram'
                    }
                  >
                    <LuSend className="h-4 w-4" />
                    В Telegram
                  </button>
                  <button
                    type="button"
                    className={btnSecondary('text-red-700')}
                    disabled={deleteMut.isPending}
                    onClick={() => {
                      if (window.confirm(`Удалить бекап ${item.id}?`)) {
                        deleteMut.mutate(item.id);
                      }
                    }}
                  >
                    <LuTrash2 className="h-4 w-4" />
                    Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detailId && (
        <BodyPortal>
          <div className="fixed inset-0 z-[4200] flex items-end justify-center bg-stone-900/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:items-center">
            <div
              role="dialog"
              aria-modal="true"
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-stone-900">Состав резервной копии</h3>
                  <p className="mt-1 text-sm text-stone-600 font-semibold">{detailId}</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
                  onClick={() => setDetailId(null)}
                  aria-label="Закрыть"
                >
                  <LuX className="h-5 w-5" />
                </button>
              </div>

              {detailLoading && (
                <p className="mt-4 text-sm text-stone-500">Загрузка деталей…</p>
              )}
              {detailError && (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  {detailError}
                </p>
              )}
              {detail && (
                <div className="mt-4 space-y-5 text-sm">
                  <ComponentChips components={detail.components} />

                  {detail.inventory && (
                    <div>
                      <h4 className="font-bold text-stone-900">Инвентарь данных</h4>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-lg bg-stone-50 px-3 py-2">
                          <div className="text-xs text-stone-500">Участники</div>
                          <div className="font-semibold">{detail.inventory.members.total}</div>
                        </div>
                        <div className="rounded-lg bg-stone-50 px-3 py-2">
                          <div className="text-xs text-stone-500">Переписки</div>
                          <div className="font-semibold">
                            {detail.inventory.messenger.conversations}
                          </div>
                        </div>
                        <div className="rounded-lg bg-stone-50 px-3 py-2">
                          <div className="text-xs text-stone-500">Сообщения</div>
                          <div className="font-semibold">
                            {detail.inventory.messenger.messages}
                          </div>
                        </div>
                        <div className="rounded-lg bg-stone-50 px-3 py-2">
                          <div className="text-xs text-stone-500">Админы</div>
                          <div className="font-semibold">{detail.inventory.members.admins}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {detail.messenger_summary && detail.messenger_summary.sample.length > 0 && (
                    <div>
                      <h4 className="font-bold text-stone-900">Переписки (сводка)</h4>
                      <ul className="mt-2 max-h-40 divide-y divide-stone-100 overflow-auto rounded-lg border border-stone-100">
                        {detail.messenger_summary.sample.map((c) => (
                          <li key={c.id} className="flex justify-between gap-2 px-3 py-2 text-xs">
                            <span className="truncate font-medium text-stone-800">
                              {c.title || `Чат #${c.id}`}
                              {c.kind ? (
                                <span className="ml-1 font-normal text-stone-400">({c.kind})</span>
                              ) : null}
                            </span>
                            <span className="shrink-0 text-stone-500">{c.message_count} сообщ.</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {detail.settings_meta && (
                    <div>
                      <h4 className="font-bold text-stone-900">Настройки</h4>
                      <p className="mt-1 text-xs text-stone-600">
                        Полей в снимке: {detail.settings_meta.keys.length}
                        {detail.settings_meta.redacted_keys.length > 0
                          ? ` · секретов скрыто: ${detail.settings_meta.redacted_keys.length}`
                          : ''}
                        . Полные значения (включая токены) — внутри дампа БД.
                      </p>
                    </div>
                  )}

                  {detail.server && (
                    <div>
                      <h4 className="font-bold text-stone-900">Сервер</h4>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-600 sm:grid-cols-3">
                        <div>
                          <dt className="text-stone-400">Хост</dt>
                          <dd className="font-medium text-stone-800">
                            {String(detail.server.hostname ?? '—')}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-stone-400">Node</dt>
                          <dd className="font-medium text-stone-800">
                            {String(detail.server.node ?? '—')}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-stone-400">Git</dt>
                          <dd className="font-medium text-stone-800">
                            {String(detail.server.git_sha ?? '—')}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-stone-400">ОС</dt>
                          <dd className="font-medium text-stone-800">
                            {String(detail.server.platform ?? '—')} {String(detail.server.release ?? '')}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-stone-400">Env-ключей</dt>
                          <dd className="font-medium text-stone-800">
                            {String(detail.server.env_key_count ?? '—')}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-stone-400">Пакет</dt>
                          <dd className="font-medium text-stone-800">
                            {String(detail.server.package_version ?? '—')}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}

                  {detail.storage && (
                    <div>
                      <h4 className="font-bold text-stone-900">Облачные файлы (Storage)</h4>
                      {!detail.storage.configured ? (
                        <p className="mt-1 text-xs text-amber-700">
                          Supabase Storage не был настроен на момент бекапа.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-1 text-xs">
                          {detail.storage.buckets.map((b) => (
                            <li key={b.name} className="flex justify-between rounded-lg bg-stone-50 px-3 py-2">
                              <span className="font-medium text-stone-800">{b.name}</span>
                              <span className="text-stone-500">
                                {b.objects} файлов · {formatBytes(b.bytes)}
                                {b.error ? ` · ${b.error}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {detail.manifest_text && (
                    <details className="rounded-lg border border-stone-100">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-stone-700">
                        MANIFEST.txt
                      </summary>
                      <pre className="max-h-48 overflow-auto border-t border-stone-100 bg-stone-900 p-3 text-[11px] text-stone-100">
                        {detail.manifest_text}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="mt-5">
                <button type="button" className={btnSecondary()} onClick={() => setDetailId(null)}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </BodyPortal>
      )}

      {restoreId && (
        <BodyPortal><div className="fixed inset-0 z-[4200] flex items-end justify-center bg-stone-900/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900">Восстановление из бекапа</h3>
                <p className="mt-1 text-sm text-stone-600">
                  <span className="font-semibold text-stone-800">{restoreId}</span>
                  <br />
                  Текущие данные будут заменены. Перед записью сервер создаст safety-бекап.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
                onClick={() => !restoreMut.isPending && setRestoreId(null)}
                aria-label="Закрыть"
              >
                <LuX className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <label className="flex items-center gap-2 font-medium text-stone-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-stone-300 text-primary"
                  checked={restoreDb}
                  onChange={(e) => {
                    setRestoreDb(e.target.checked);
                    setDryRunOk(false);
                  }}
                />
                База данных (PostgreSQL)
              </label>
              <label className="flex items-center gap-2 font-medium text-stone-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-stone-300 text-primary"
                  checked={restoreUploads}
                  onChange={(e) => {
                    setRestoreUploads(e.target.checked);
                    setDryRunOk(false);
                  }}
                />
                Файлы uploads
              </label>
              <label className="flex items-center gap-2 font-medium text-stone-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-stone-300 text-primary"
                  checked={restoreSecrets}
                  onChange={(e) => {
                    setRestoreSecrets(e.target.checked);
                    setDryRunOk(false);
                  }}
                />
                secrets/ (ключи Firebase и др.)
              </label>

              <label className="block">
                <span className="mb-1 block font-medium text-stone-700">
                  Пароль шифрования бекапа (если был)
                </span>
                <input
                  type="password"
                  className={fieldClass()}
                  value={restorePassphrase}
                  onChange={(e) => {
                    setRestorePassphrase(e.target.value);
                    setDryRunOk(false);
                  }}
                  placeholder="Необязательно"
                  autoComplete="off"
                />
              </label>

              <label className="block">
                <span className="mb-1 block font-medium text-stone-700">
                  Для записи введите{' '}
                  <span className="font-bold text-red-700">{confirmPhrase}</span>
                </span>
                <input
                  className={fieldClass()}
                  value={restoreConfirm}
                  onChange={(e) => setRestoreConfirm(e.target.value)}
                  placeholder={confirmPhrase}
                  autoComplete="off"
                />
              </label>

              {dryRunOk && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900">
                  Проверка пройдена. Можно запускать полное восстановление.
                </p>
              )}

              {restoreLog && (
                <pre className="max-h-40 overflow-auto rounded-lg bg-stone-900 p-3 text-[11px] leading-relaxed text-stone-100">
                  {restoreLog}
                </pre>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className={btnSecondary()}
                disabled={restoreMut.isPending || (!restoreDb && !restoreUploads && !restoreSecrets)}
                onClick={() => restoreMut.mutate({ dry_run: true })}
              >
                {restoreMut.isPending && restoreMut.variables?.dry_run
                  ? 'Проверяем…'
                  : '1. Проверить (безопасно)'}
              </button>
              <button
                type="button"
                className={btnPrimary('bg-red-600 shadow-red-600/20')}
                disabled={
                  restoreMut.isPending ||
                  restoreConfirm.trim() !== confirmPhrase ||
                  (!restoreDb && !restoreUploads && !restoreSecrets)
                }
                onClick={() => {
                  if (
                    window.confirm(
                      `Восстановить проект из ${restoreId}? Текущие данные будут перезаписаны.`,
                    )
                  ) {
                    restoreMut.mutate({ dry_run: false });
                  }
                }}
              >
                <LuRotateCcw className={`h-4 w-4 ${restoreMut.isPending && !restoreMut.variables?.dry_run ? 'animate-spin' : ''}`} />
                {restoreMut.isPending && !restoreMut.variables?.dry_run
                  ? 'Восстанавливаем…'
                  : '2. Восстановить всё'}
              </button>
              <button
                type="button"
                className={btnSecondary()}
                disabled={restoreMut.isPending}
                onClick={() => setRestoreId(null)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div></BodyPortal>
      )}
    </div>
  );
}
