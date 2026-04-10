import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { fetchInstrumentSettings, patchInstrumentSettings } from '../api';

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

  if (q.isLoading) return <p className="text-zinc-500">Загрузка…</p>;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-lg font-semibold text-white">Настройки инструментов</h1>
      <p className="text-sm text-zinc-400">
        Произвольный JSON (транспонирование по умолчанию, MIDI и т.д.) — для расширения.
      </p>
      <textarea
        className="min-h-[200px] w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200"
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
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
        className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
      >
        Сохранить
      </button>
    </div>
  );
}
