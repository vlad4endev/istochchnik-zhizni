import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { LuBot } from 'react-icons/lu';

import {
  apiErrorMessage,
  fetchAiSettingsAdmin,
  patchAiSettings,
  postAiTest,
  type AiSettingsAdminResponse,
} from './api';

const Q_AI = ['admin', 'ai', 'settings'] as const;

function fieldClass() {
  return (
    'w-full rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-stone-400'
  );
}

function btnPrimary(c = '') {
  return `rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-50 ${c}`;
}

function btnSecondary(c = '') {
  return `rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 ${c}`;
}

/** Пустое поле ключа — не менять сохранённое значение; непустое — записать. */
function optionalApiKeyFromUi(value: string): string | undefined {
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

export function AiSettingsSection() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: Q_AI,
    queryFn: fetchAiSettingsAdmin,
  });

  const [form, setForm] = useState({
    enabled: false,
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
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: data.enabled,
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
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => {
      const section_payload: Record<string, string | null> = {};
      for (const s of data?.prompt_scopes ?? []) {
        const v = (sectionPrompts[s.id] ?? '').trim();
        section_payload[s.id] = v.length > 0 ? v : null;
      }
      return patchAiSettings({
        enabled: form.enabled,
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
      setNote({ type: 'ok', text: 'Настройки ИИ сохранены. Они используются сервером при вызовах агента.' });
      qc.setQueryData(Q_AI, next);
      setForm((prev) => ({ ...prev, api_key: '' }));
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить настройки ИИ.') }),
  });

  const clearKeyMut = useMutation({
    mutationFn: () => patchAiSettings({ api_key: null }),
    onSuccess: (next) => {
      setNote({ type: 'ok', text: 'Ключ в базе сброшен. Если задан AI_API_KEY в окружении, он по-прежнему будет использоваться.' });
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

  if (isLoading) {
    return <div className="h-44 animate-pulse rounded-2xl bg-stone-200/50" />;
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

  const settings = (data ?? {
    enabled: false,
    provider: 'openai_compatible',
    base_url: '',
    api_key_masked: null,
    has_api_key: false,
    default_model: '',
    system_prompt: null,
    prompt_scopes: [],
    section_prompts: {},
    temperature: 0.7,
    max_tokens: 2048,
  }) satisfies AiSettingsAdminResponse;

  return (
    <div className="max-w-3xl space-y-5">
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

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h3 className="flex items-center gap-2 text-base font-extrabold text-stone-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LuBot className="h-5 w-5" />
          </span>
          Языковые модели (серверный агент)
        </h3>
        <p className="mt-2 text-sm text-stone-600">
          Подключение по протоколу OpenAI Chat Completions (<span className="font-mono text-xs">/v1/chat/completions</span>
          ). Подходит для OpenAI, OpenRouter, Azure OpenAI (с корректным base URL) и совместимых прокси.
        </p>

        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-stone-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-stone-300 text-primary"
            checked={form.enabled}
            onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
          />
          Включить использование ИИ на сервере
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-stone-600">Base URL API</label>
            <input
              className={fieldClass()}
              value={form.base_url}
              onChange={(e) => setForm((s) => ({ ...s, base_url: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-stone-500">
              Можно переопределить через переменную окружения <code className="rounded bg-stone-100 px-1">AI_BASE_URL</code>.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-stone-600">API Key</label>
            <input
              className={fieldClass()}
              type="password"
              value={form.api_key}
              onChange={(e) => setForm((s) => ({ ...s, api_key: e.target.value }))}
              placeholder={
                settings.api_key_masked ? `Текущий ключ: ${settings.api_key_masked}` : 'sk-...'
              }
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-stone-500">
              Оставьте пустым, чтобы не менять ключ. Альтернатива:{' '}
              <code className="rounded bg-stone-100 px-1">AI_API_KEY</code> или{' '}
              <code className="rounded bg-stone-100 px-1">OPENAI_API_KEY</code> на сервере.
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

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-stone-600">Модель по умолчанию</label>
            <input
              className={fieldClass()}
              value={form.default_model}
              onChange={(e) => setForm((s) => ({ ...s, default_model: e.target.value }))}
              placeholder="gpt-4o-mini"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-stone-500">
              Переопределение через <code className="rounded bg-stone-100 px-1">AI_MODEL</code> — имеет приоритет над полем.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-600">Temperature</label>
            <input
              className={fieldClass()}
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) => setForm((s) => ({ ...s, temperature: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-600">Max tokens</label>
            <input
              className={fieldClass()}
              type="number"
              min={64}
              max={128000}
              step={64}
              value={form.max_tokens}
              onChange={(e) => setForm((s) => ({ ...s, max_tokens: Number(e.target.value) }))}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-stone-600">Системный промпт по умолчанию</label>
            <textarea
              className={`${fieldClass()} min-h-[120px]`}
              value={form.system_prompt}
              onChange={(e) => setForm((s) => ({ ...s, system_prompt: e.target.value }))}
              placeholder="Роль ассистента, если для раздела ниже не задан отдельный промпт."
            />
          </div>

          <div className="sm:col-span-2 rounded-xl border border-stone-200/90 bg-stone-50/80 p-4">
            <p className="text-sm font-extrabold text-stone-900">Промпты по разделам</p>
            <p className="mt-1 text-xs text-stone-600">
              Задайте текст и выберите раздел через подпись поля. В коде сервиса передайте{' '}
              <code className="rounded bg-white px-1 font-mono text-[11px]">chatCompletion(..., &#123; section: &apos;messenger&apos; &#125;)</code>
              — подставится промпт этого раздела, иначе используется общий промпт выше.
            </p>
            <div className="mt-4 space-y-4">
              {(settings.prompt_scopes ?? []).map((scope) => (
                <div key={scope.id}>
                  <label className="mb-1 block text-xs font-semibold text-stone-700">
                    {scope.label}
                    <span className="ml-2 font-mono font-normal text-stone-400">({scope.id})</span>
                  </label>
                  <textarea
                    className={`${fieldClass()} min-h-[88px]`}
                    value={sectionPrompts[scope.id] ?? ''}
                    onChange={(e) =>
                      setSectionPrompts((prev) => ({
                        ...prev,
                        [scope.id]: e.target.value,
                      }))
                    }
                    placeholder={`Промпт только для раздела «${scope.label}»…`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className={btnPrimary()}
            disabled={saveMut.isPending}
            onClick={() => {
              setNote(null);
              saveMut.mutate();
            }}
          >
            Сохранить
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 p-5">
        <h4 className="text-sm font-extrabold text-stone-900">Проверка связи</h4>
        <p className="mt-1 text-xs text-stone-600">
          Отправляет короткий тестовый запрос к выбранной модели (учитываются включение модуля и ключ).
        </p>
        <div className="mt-3">
          <label className="block text-xs font-semibold text-stone-600">Раздел для теста (опционально)</label>
          <select
            className={`${fieldClass()} mt-1 max-w-md`}
            value={testSection}
            onChange={(e) => setTestSection(e.target.value)}
          >
            <option value="">Общий системный промпт (без раздела)</option>
            {(settings.prompt_scopes ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <label className="mt-3 block text-xs font-semibold text-stone-600">Текст (необязательно)</label>
        <textarea
          className={`${fieldClass()} mt-1 min-h-[72px]`}
          value={testPrompt}
          onChange={(e) => setTestPrompt(e.target.value)}
          placeholder="Если пусто — используется стандартная короткая проверка."
        />
        <button
          type="button"
          className={btnSecondary('mt-3')}
          disabled={testMut.isPending || !settings.enabled}
          title={!settings.enabled ? 'Сохраните включение модуля — тест идёт по данным на сервере' : undefined}
          onClick={() => {
            setNote(null);
            testMut.mutate();
          }}
        >
          {testMut.isPending ? 'Запрос…' : 'Отправить тест'}
        </button>
        {!settings.enabled ? (
          <p className="mt-2 text-xs text-amber-800">
            Тест обращается к уже сохранённым настройкам: включите модуль и нажмите «Сохранить», затем проверьте связь.
          </p>
        ) : null}
      </section>
    </div>
  );
}
