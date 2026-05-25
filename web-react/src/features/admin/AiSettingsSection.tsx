import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { LuBot, LuCheck, LuKeyRound, LuServer } from 'react-icons/lu';

import { DecimalTextInput } from '@/components/DecimalTextInput';
import { IntegerTextInput } from '@/components/IntegerTextInput';
import {
  apiErrorMessage,
  fetchAiSettingsAdmin,
  patchAiSettings,
  postAiTest,
  type AiConnectionPresetId,
  type AiPresetCatalogEntry,
  type AiSettingsAdminResponse,
} from './api';

const Q_AI = ['admin', 'ai', 'settings'] as const;

const MANUAL_MODEL = '__manual__';

function fieldClass() {
  return (
    'w-full rounded-xl border border-stone-200/90 bg-[var(--surface-elevated)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-[var(--text-muted)]'
  );
}

function btnPrimary(c = '') {
  return `rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-50 ${c}`;
}

function btnSecondary(c = '') {
  return `rounded-xl border border-stone-200 bg-[var(--surface-elevated)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface)] ${c}`;
}

function optionalApiKeyFromUi(value: string): string | undefined {
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

function applyCatalogPreset(
  preset: Exclude<AiConnectionPresetId, 'custom'>,
  catalog: AiPresetCatalogEntry[],
): { base_url: string; default_model: string } {
  const e = catalog.find((c) => c.id === preset);
  if (e) {
    return { base_url: e.base_url, default_model: e.default_model };
  }
  return { base_url: 'https://api.openai.com/v1', default_model: 'gpt-4o-mini' };
}

export function AiSettingsSection() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: Q_AI,
    queryFn: fetchAiSettingsAdmin,
  });

  const [form, setForm] = useState({
    enabled: false,
    connection_preset: 'openai' as AiConnectionPresetId,
    base_url: '',
    api_key: '',
    default_model: '',
    system_prompt: '',
    temperature: 0.7,
    max_tokens: 2048,
  });
  const [sectionPrompts, setSectionPrompts] = useState<Record<string, string>>({});
  const [testPrompt, setTestPrompt] = useState('');
  const [testSection, setTestSection] = useState('');
  /** Пользователь явно выбрал «Другая модель…» в списке (иначе селект «откатывается»). */
  const [forceManualModel, setForceManualModel] = useState(false);
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: data.enabled,
      connection_preset: data.connection_preset,
      base_url: data.base_url ?? '',
      api_key: '',
      default_model: data.default_model ?? '',
      system_prompt: data.system_prompt ?? '',
      temperature: data.temperature,
      max_tokens: data.max_tokens,
    });
    const sp: Record<string, string> = {};
    for (const s of data.prompt_scopes ?? []) {
      sp[s.id] = data.section_prompts[s.id] ?? '';
    }
    setSectionPrompts(sp);
    setForceManualModel(false);
  }, [data]);

  const catalog = data?.preset_catalog ?? [];

  const activeCatalogEntry = useMemo(() => {
    if (form.connection_preset === 'custom') return undefined;
    return catalog.find((c) => c.id === form.connection_preset);
  }, [catalog, form.connection_preset]);

  const modelSelectValue = useMemo(() => {
    if (form.connection_preset === 'custom') return MANUAL_MODEL;
    if (forceManualModel) return MANUAL_MODEL;
    const opts = activeCatalogEntry?.model_options ?? [];
    return opts.some((o) => o.id === form.default_model) ? form.default_model : MANUAL_MODEL;
  }, [activeCatalogEntry, forceManualModel, form.connection_preset, form.default_model]);

  const saveMut = useMutation({
    mutationFn: () => {
      const section_payload: Record<string, string | null> = {};
      for (const s of data?.prompt_scopes ?? []) {
        const v = (sectionPrompts[s.id] ?? '').trim();
        section_payload[s.id] = v.length > 0 ? v : null;
      }
      return patchAiSettings({
        enabled: form.enabled,
        connection_preset: form.connection_preset,
        base_url: form.base_url.trim(),
        api_key: optionalApiKeyFromUi(form.api_key),
        default_model: form.default_model.trim(),
        system_prompt: form.system_prompt.trim() ? form.system_prompt.trim() : null,
        section_prompts: section_payload,
        temperature: form.temperature,
        max_tokens: form.max_tokens,
      });
    },
    onSuccess: (next) => {
      setNote({
        type: 'ok',
        text: 'Настройки сохранены. Можно отправить тестовый запрос ниже.',
      });
      qc.setQueryData(Q_AI, next);
      setForm((prev) => ({ ...prev, api_key: '' }));
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить настройки ИИ.') }),
  });

  const clearKeyMut = useMutation({
    mutationFn: () => patchAiSettings({ api_key: null }),
    onSuccess: (next) => {
      setNote({
        type: 'ok',
        text: 'Ключ в базе сброшен. Если задан AI_API_KEY в окружении, он по-прежнему используется.',
      });
      qc.setQueryData(Q_AI, next);
      setForm((prev) => ({ ...prev, api_key: '' }));
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сбросить ключ.') }),
  });

  const testMut = useMutation({
    mutationFn: () =>
      postAiTest({
        message: testPrompt.trim() || undefined,
        section: testSection.trim() || undefined,
      }),
    onSuccess: (r) => {
      setNote({ type: 'ok', text: `Ответ модели: ${r.reply}` });
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Тестовый запрос не выполнен.') }),
  });

  function selectPreset(preset: AiConnectionPresetId) {
    if (!data) return;
    setForceManualModel(false);
    if (preset === 'custom') {
      setForm((f) => ({ ...f, connection_preset: 'custom' }));
      return;
    }
    const { base_url, default_model } = applyCatalogPreset(preset, data.preset_catalog);
    setForm((f) => ({
      ...f,
      connection_preset: preset,
      base_url,
      default_model,
    }));
  }

  if (isLoading) {
    return <div className="h-44 animate-pulse rounded-2xl bg-[var(--surface)]" />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center">
        <p className="font-semibold text-red-900">Не удалось загрузить настройки ИИ</p>
        <p className="mt-2 text-sm text-red-800">{apiErrorMessage(error, 'Ошибка сети или сервера.')}</p>
        <button type="button" className={btnPrimary('mt-4')} onClick={() => void qc.invalidateQueries({ queryKey: Q_AI })}>
          Обновить
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const settings: AiSettingsAdminResponse = data;

  return (
    <div className="max-w-4xl space-y-5">
      {note ? (
        <div
          className={
            note.type === 'ok'
              ? 'rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
        >
          {note.text}
        </div>
      ) : null}

      <section className="rounded-xl border border-[#F0E9EA] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)] sm:p-6">
        <h3 className="flex items-center gap-2 text-base font-extrabold text-[var(--text)]">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LuBot className="h-5 w-5" />
          </span>
          Подключение к модели
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          Выберите сервис — подставятся адрес API и модель по умолчанию. Дальше вставьте ключ и сохраните.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-[#F3EEF0] px-3 py-1.5 font-semibold text-[#7B2D3F]">1 · Сервис</span>
          <span className="text-[var(--text-muted)]">→</span>
          <span className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[var(--text-secondary)]">2 · Ключ API</span>
          <span className="text-[var(--text-muted)]">→</span>
          <span className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[var(--text-secondary)]">3 · Сохранить</span>
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {settings.preset_catalog.map((entry) => {
            const active = form.connection_preset === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => selectPreset(entry.id)}
                className={
                  active
                    ? 'relative flex min-h-[110px] flex-col rounded-xl border-2 border-[#7B2D3F] bg-[#FFF8F8] p-3.5 text-left transition'
                    : 'flex min-h-[110px] flex-col rounded-xl border-2 border-stone-200 bg-[var(--surface-elevated)] p-3.5 text-left transition hover:border-[#D4B8BE]'
                }
              >
                {active ? (
                  <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white">
                    <LuCheck className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                ) : null}
                <span className="pr-8 text-sm font-semibold text-[var(--text)]">{entry.label}</span>
                <span className="mt-1 text-xs leading-snug text-[var(--text-secondary)]">{entry.description}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => selectPreset('custom')}
            className={
              form.connection_preset === 'custom'
                ? 'relative flex min-h-[110px] flex-col rounded-xl border-2 border-[#7B2D3F] bg-[#FFF8F8] p-3.5 text-left transition'
                : 'flex min-h-[110px] flex-col rounded-xl border-2 border-stone-200 bg-[var(--surface-elevated)] p-3.5 text-left transition hover:border-[#D4B8BE]'
            }
          >
            {form.connection_preset === 'custom' ? (
              <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white">
                <LuCheck className="h-4 w-4" strokeWidth={2.5} />
              </span>
            ) : null}
            <span className="flex items-center gap-2 pr-8 text-sm font-semibold text-[var(--text)]">
              <LuServer className="h-4 w-4 text-[var(--text-secondary)]" />
              Свой URL
            </span>
            <span className="mt-1 text-xs leading-snug text-[var(--text-secondary)]">
              Любой OpenAI-совместимый endpoint (локально, Azure, прокси).
            </span>
          </button>
        </div>

        {form.connection_preset !== 'custom' && activeCatalogEntry ? (
          <div className="mt-5 rounded-xl border border-stone-200/90 bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text)]">Ключ: </span>
            {activeCatalogEntry.key_hint}
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
              <LuKeyRound className="h-3.5 w-3.5" />
              API Key
            </label>
            <input
              className={`${fieldClass()} text-base sm:text-sm`}
              type="password"
              value={form.api_key}
              onChange={(e) => setForm((s) => ({ ...s, api_key: e.target.value }))}
              placeholder={
                settings.api_key_masked
                  ? `Сохранён: ${settings.api_key_masked} — вставьте новый, чтобы заменить`
                  : 'Вставьте секретный ключ'
              }
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Оставьте пустым при сохранении, если ключ не меняется. Для сервера можно задать{' '}
              <code className="rounded bg-[var(--surface)] px-1">AI_API_KEY</code> или{' '}
              <code className="rounded bg-[var(--surface)] px-1">OPENAI_API_KEY</code>.
            </p>
            {settings.has_api_key ? (
              <button
                type="button"
                className={btnSecondary('mt-2')}
                disabled={clearKeyMut.isPending}
                onClick={() => {
                  if (!window.confirm('Удалить ключ из базы? Ключ из .env сохранится.')) return;
                  clearKeyMut.mutate();
                }}
              >
                Удалить ключ из базы
              </button>
            ) : null}
          </div>

          {form.connection_preset === 'custom' ? (
            <div className="grid gap-3 sm:grid-cols-1">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">Base URL</label>
                <input
                  className={fieldClass()}
                  value={form.base_url}
                  onChange={(e) => setForm((s) => ({ ...s, base_url: e.target.value }))}
                  placeholder="https://…/v1"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">ID модели</label>
                <input
                  className={fieldClass()}
                  value={form.default_model}
                  onChange={(e) => setForm((s) => ({ ...s, default_model: e.target.value }))}
                  placeholder="например gpt-4o-mini"
                  autoComplete="off"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-stone-600">Модель</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    className={`${fieldClass()} sm:max-w-md`}
                    value={modelSelectValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === MANUAL_MODEL) {
                        setForceManualModel(true);
                        return;
                      }
                      setForceManualModel(false);
                      setForm((s) => ({ ...s, default_model: v }));
                    }}
                  >
                    {(activeCatalogEntry?.model_options ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                    <option value={MANUAL_MODEL}>Другая модель…</option>
                  </select>
                  {modelSelectValue === MANUAL_MODEL ? (
                    <input
                      className={fieldClass()}
                      value={form.default_model}
                      onChange={(e) => {
                        setForceManualModel(true);
                        setForm((s) => ({ ...s, default_model: e.target.value }));
                      }}
                      placeholder="точное имя модели у провайдера"
                      autoComplete="off"
                    />
                  ) : null}
                </div>
              </div>
              <div className="sm:col-span-2 rounded-lg border border-stone-100 bg-stone-50/90 px-3 py-2 font-mono text-xs text-stone-600">
                <span className="font-sans font-semibold text-stone-500">Endpoint: </span>
                {form.base_url}
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-stone-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-stone-300 text-primary"
              checked={form.enabled}
              onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
            />
            Включить ИИ на сервере
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className={btnPrimary('bg-[#7B2D3F]')}
            disabled={saveMut.isPending}
            onClick={() => {
              setNote(null);
              saveMut.mutate();
            }}
          >
            Сохранить и проверить
          </button>
        </div>
      </section>

      <details className="group rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)]">
        <summary className="cursor-pointer list-none px-5 py-4 font-extrabold text-stone-900 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="underline decoration-stone-300 decoration-2 underline-offset-2 group-open:no-underline">
            Дополнительно: температура, промпты
          </span>
          <span className="ml-2 text-xs font-semibold text-stone-500">(необязательно)</span>
        </summary>
        <div className="space-y-5 border-t border-stone-200/80 px-5 pb-5 pt-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600">Temperature</label>
              <DecimalTextInput
                syncKey="ai-temperature"
                className={fieldClass()}
                value={form.temperature}
                min={0}
                max={2}
                maxFractionDigits={1}
                onChange={(temperature) => setForm((s) => ({ ...s, temperature }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600">Max tokens</label>
              <IntegerTextInput
                syncKey="ai-max-tokens"
                className={fieldClass()}
                value={form.max_tokens}
                min={64}
                max={128000}
                maxDigits={6}
                onChange={(max_tokens) => setForm((s) => ({ ...s, max_tokens }))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-600">Системный промпт по умолчанию</label>
              <textarea
                className={`${fieldClass()} min-h-[100px]`}
                value={form.system_prompt}
                onChange={(e) => setForm((s) => ({ ...s, system_prompt: e.target.value }))}
                placeholder="Если для раздела не задан свой промпт — используется этот."
              />
            </div>
          </div>

          <div className="rounded-xl border border-stone-200/90 bg-stone-50/80 p-4">
            <p className="text-sm font-extrabold text-stone-900">Промпты по разделам приложения</p>
            <p className="mt-1 text-xs text-stone-600">
              Опционально: отдельный текст для{' '}
              <code className="rounded bg-white px-1 font-mono text-xs">chatCompletion(..., &#123; section: &apos;…&apos; &#125;)</code>
              .
            </p>
            <div className="mt-4 space-y-4">
              {(settings.prompt_scopes ?? []).map((scope) => (
                <div key={scope.id}>
                  <label className="mb-1 block text-xs font-semibold text-stone-700">
                    {scope.label}
                    <span className="ml-2 font-mono font-normal text-stone-400">({scope.id})</span>
                  </label>
                  <textarea
                    className={`${fieldClass()} min-h-[72px]`}
                    value={sectionPrompts[scope.id] ?? ''}
                    onChange={(e) =>
                      setSectionPrompts((prev) => ({
                        ...prev,
                        [scope.id]: e.target.value,
                      }))
                    }
                    placeholder={`Только для «${scope.label}»…`}
                  />
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-stone-500">
            Переопределение через ENV: <code className="rounded bg-stone-100 px-1">AI_BASE_URL</code>,{' '}
            <code className="rounded bg-stone-100 px-1">AI_MODEL</code> — имеет приоритет над полями формы.
          </p>
        </div>
      </details>

      <section className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 p-5">
        <h4 className="text-sm font-extrabold text-stone-900">Проверка связи</h4>
        <p className="mt-1 text-xs text-stone-600">Запрос выполняется с уже сохранёнными настройками.</p>
        <div className="mt-3">
          <label className="block text-xs font-semibold text-stone-600">Раздел промпта (опционально)</label>
          <select
            className={`${fieldClass()} mt-1 max-w-md`}
            value={testSection}
            onChange={(e) => setTestSection(e.target.value)}
          >
            <option value="">Общий системный промпт</option>
            {(settings.prompt_scopes ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <label className="mt-3 block text-xs font-semibold text-stone-600">Сообщение пользователя (опционально)</label>
        <textarea
          className={`${fieldClass()} mt-1 min-h-[72px]`}
          value={testPrompt}
          onChange={(e) => setTestPrompt(e.target.value)}
          placeholder="Если пусто — короткая встроенная проверка."
        />
        <button
          type="button"
          className={btnSecondary('mt-3')}
          disabled={testMut.isPending || !settings.enabled}
          title={!settings.enabled ? 'Сначала включите ИИ и сохраните настройки' : undefined}
          onClick={() => {
            setNote(null);
            testMut.mutate();
          }}
        >
          {testMut.isPending ? 'Запрос…' : 'Отправить тест'}
        </button>
        {!settings.enabled ? (
          <p className="mt-2 text-xs text-amber-800">
            Сохраните настройки с включённым «Включить ИИ на сервере», затем проверьте связь.
          </p>
        ) : null}
      </section>
    </div>
  );
}
