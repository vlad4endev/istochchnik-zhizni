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
      <header className="space-y-2 border-b border-[var(--studio-editor-border)] pb-5">
        <h1 className="studio-page-heading text-xl font-bold text-[var(--studio-editor-text)] md:text-2xl">Инструменты</h1>
        <p className="text-sm leading-relaxed text-[var(--studio-editor-mute)]">
          Расширенные настройки в формате JSON. Обычно этот раздел не нужен.
        </p>
      </header>
      <textarea
        className="studio-input min-h-[min(50dvh,320px)] font-mono text-sm"
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
        className="studio-btn-primary min-h-[44px] w-full rounded-xl sm:w-auto"
      >
        Сохранить
      </button>
    </div>
  );
}
