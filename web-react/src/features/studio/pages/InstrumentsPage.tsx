import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { fetchInstrumentSettings, patchInstrumentSettings } from '../api';
import { SkeletonBox } from '@/components/ui/SkeletonBox';

export function InstrumentsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['studio', 'instruments'], queryFn: fetchInstrumentSettings });
  const [jsonText, setJsonText] = useState('{}');

  useEffect(() => {
    if (q.data?.settings) {
      setJsonText(JSON.stringify(q.data.settings, null, 2));
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      await patchInstrumentSettings(parsed);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['studio', 'instruments'] }),
  });

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <SkeletonBox width="22%" height="22px" />
        <SkeletonBox width="100%" height="220px" radius="12px" />
        <SkeletonBox width="120px" height="40px" radius="10px" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header className="space-y-2 border-b border-[var(--border)] pb-5">
        <h1 className="text-xl font-bold text-[var(--text)]">Инструменты</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Расширенные настройки в формате JSON (транспонирование по умолчанию, MIDI и т.д.). Обычно этот раздел
          не нужен — меняйте только если знаете, зачем.
        </p>
      </header>
      <textarea
        className="min-h-[220px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3 font-mono text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => {
          try {
            JSON.parse(jsonText);
          } catch {
            window.alert('Некорректный JSON');
            return;
          }
          save.mutate();
        }}
        disabled={save.isPending}
        className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-primary)] hover:bg-[var(--primary-dark)] disabled:opacity-50"
      >
        Сохранить
      </button>
    </div>
  );
}
