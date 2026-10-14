import { useEffect, useState } from 'react';

import { apiClient } from '../../lib/apiClient';

type Prefs = {
  messagesEnabled: boolean;
  callsEnabled: boolean;
  systemEnabled: boolean;
  dndEnabled: boolean;
  dndStartMinute: number;
  dndEndMinute: number;
  timezone: string;
};

function minuteToInput(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function inputToMinute(v: string): number {
  const [h, m] = v.split(':').map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function PushPrefsPanel() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void apiClient
      .get<Prefs>('/api/notifications/push-prefs')
      .then((r) => setPrefs(r.data))
      .catch(() => undefined);
  }, []);

  if (!prefs) return null;

  const save = async (next: Prefs) => {
    setSaving(true);
    try {
      const { data } = await apiClient.put<Prefs>('/api/notifications/push-prefs', next);
      setPrefs(data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3" aria-label="Настройки push">
      <h3 className="text-sm font-semibold">Уведомления устройства</h3>
      {(
        [
          ['messagesEnabled', 'Сообщения'],
          ['callsEnabled', 'Звонки'],
          ['systemEnabled', 'Системные'],
          ['dndEnabled', 'Не беспокоить'],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex items-center justify-between gap-3 text-sm">
          <span>{label}</span>
          <input
            type="checkbox"
            checked={prefs[key]}
            disabled={saving}
            onChange={(e) => {
              const next = { ...prefs, [key]: e.target.checked };
              setPrefs(next);
              void save(next);
            }}
          />
        </label>
      ))}
      {prefs.dndEnabled && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label>
            с{' '}
            <input
              type="time"
              value={minuteToInput(prefs.dndStartMinute)}
              onChange={(e) => {
                const next = { ...prefs, dndStartMinute: inputToMinute(e.target.value) };
                setPrefs(next);
                void save(next);
              }}
            />
          </label>
          <label>
            до{' '}
            <input
              type="time"
              value={minuteToInput(prefs.dndEndMinute)}
              onChange={(e) => {
                const next = { ...prefs, dndEndMinute: inputToMinute(e.target.value) };
                setPrefs(next);
                void save(next);
              }}
            />
          </label>
        </div>
      )}
    </section>
  );
}
