import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaPrayingHands } from 'react-icons/fa';
import { LuBookOpen, LuMapPin, LuWrench } from 'react-icons/lu';
import { fetchPrayerByDate } from './api/prayer';
import type { DayPrayerData } from './types';

function formatDisplayDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

function todayIsoUtc(): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

export function App() {
  const [date, setDate] = useState(todayIsoUtc);
  const [data, setData] = useState<DayPrayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchPrayerByDate(d);
      setData(json);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  const member = data?.members[0];
  const theme = data?.global_themes[0];
  const ministry = data?.ministries[0];
  const backslider = data?.backsliders[0];

  const apiHint = useMemo(() => {
    const base = import.meta.env.VITE_API_BASE_URL?.trim();
    return base && base.length > 0 ? base : '(Vite proxy → localhost:40978)';
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Молитва</h1>
      </header>

      <main className="main">
        <section className="date-row">
          <label className="date-label" htmlFor="pray-date">
            Дата
          </label>
          <input
            id="pray-date"
            type="date"
            className="date-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <p className="date-caption">{formatDisplayDate(date)}</p>
        </section>

        {loading && (
          <div className="state state-loading">
            <div className="spinner" aria-hidden />
            <p>Загрузка…</p>
          </div>
        )}

        {!loading && error && (
          <div className="state state-error">
            <p className="state-title">Не удалось загрузить данные</p>
            <p className="state-msg">{error}</p>
            <p className="state-hint">
              API: <code>{apiHint}</code>
            </p>
            <button type="button" className="btn-retry" onClick={() => void load(date)}>
              Повторить
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <div className="cards">
            <article className="card card-member">
              <h2 className="card-label">Член церкви</h2>
              <p className="card-title">{member?.name ?? 'Не назначен'}</p>
              <p className="card-body">
                {(member?.prayer_request?.trim() || 'Нужда не указана').trim()}
              </p>
            </article>

            <article className="card card-theme">
              <h2 className="card-label">Тема</h2>
              <p className="card-title">
                {(theme?.title?.trim() || 'Тема не указана').toUpperCase()}
              </p>
              <p className="card-verse flex gap-2">
                <LuBookOpen className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden />
                <span>{(theme?.bible_verse?.trim() || 'Стих не указан').trim()}</span>
              </p>
              <p className="card-body flex gap-2 whitespace-pre-wrap">
                <FaPrayingHands className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden />
                <span>{(theme?.prayer_points?.trim() || 'Пункты молитвы не указаны').trim()}</span>
              </p>
            </article>

            <article className="card card-ministry">
              <h2 className="card-label">Служение</h2>
              <p className="card-body flex gap-2 whitespace-pre-wrap">
                <LuWrench className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden />
                <span>
                  {(ministry?.prayer_points?.trim() ||
                    ministry?.title?.trim() ||
                    'Служение не указано').trim()}
                </span>
              </p>
            </article>

            <article className="card card-backslider">
              <h2 className="card-label">Отпавшие</h2>
              <p className="card-body flex gap-2">
                <LuMapPin className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden />
                <span>{(backslider?.name ?? 'Не указан').trim()}</span>
              </p>
            </article>
          </div>
        )}
      </main>

      <style>{`
        .app { min-height: 100vh; display: flex; flex-direction: column; }
        .header {
          background: var(--primary);
          color: var(--text-on-primary);
          padding: 1.25rem 1.5rem;
          box-shadow: var(--shadow);
        }
        .title { margin: 0; font-size: 1.375rem; font-weight: 800; letter-spacing: -0.03em; }
        .main { flex: 1; padding: 1.25rem 1rem 2rem; max-width: 42rem; margin: 0 auto; width: 100%; }
        .date-row {
          background: var(--surface-elevated);
          border-radius: var(--radius);
          padding: 1rem 1.25rem;
          margin-bottom: 1.25rem;
          box-shadow: var(--shadow);
        }
        .date-label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.35rem; }
        .date-input {
          width: 100%;
          max-width: 12rem;
          padding: 0.5rem 0.65rem;
          border: 1px solid rgba(28,25,23,0.12);
          border-radius: 10px;
          background: var(--surface);
        }
        .date-caption { margin: 0.5rem 0 0; font-weight: 700; color: var(--text); }
        .state { text-align: center; padding: 2rem 1rem; }
        .state-loading { color: var(--text-secondary); }
        .state-error { background: var(--surface-elevated); border-radius: var(--radius); box-shadow: var(--shadow); }
        .state-title { font-weight: 700; margin: 0 0 0.5rem; }
        .state-msg { color: var(--text-secondary); margin: 0 0 0.75rem; }
        .state-hint { font-size: 0.8125rem; color: var(--text-muted); margin: 0 0 1rem; }
        .state-hint code { font-size: 0.75rem; word-break: break-all; }
        .spinner {
          width: 2.5rem; height: 2.5rem; margin: 0 auto 1rem;
          border: 3px solid rgba(125,54,64,0.2);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .btn-retry {
          background: var(--primary);
          color: var(--text-on-primary);
          border: none;
          padding: 0.65rem 1.5rem;
          border-radius: 12px;
          font-weight: 700;
        }
        .btn-retry:hover { background: var(--primary-dark); }
        .cards { display: flex; flex-direction: column; gap: 1rem; }
        .card {
          background: var(--surface-elevated);
           border-radius: var(--radius);
           padding: 1.25rem 1.35rem;
           box-shadow: var(--shadow);
           border-left: 4px solid var(--primary);
        }
        .card-member { border-left-color: var(--member); }
        .card-theme { border-left-color: var(--theme); }
        .card-ministry { border-left-color: var(--ministry); }
        .card-backslider { border-left-color: var(--backslider); }
        .card-label {
          margin: 0 0 0.35rem;
          font-size: 0.6875rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .card-title { margin: 0 0 0.5rem; font-size: 1.125rem; font-weight: 800; }
        .card-verse { margin: 0 0 0.75rem; color: var(--text-secondary); font-size: 0.95rem; }
        .card-body { margin: 0; color: var(--text-secondary); }
        .whitespace-pre-wrap { white-space: pre-wrap; }
      `}</style>
    </div>
  );
}
