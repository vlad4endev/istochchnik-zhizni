import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  fetchAnalyticsOverview,
  fetchAnalyticsPageDetail,
  fetchAnalyticsPages,
  fetchAnalyticsRealtime,
  fetchAnalyticsUserDetail,
  fetchAnalyticsUsers,
} from '../../api/analyticsApi';

type Period = 'today' | '7d' | '30d' | '90d' | 'all';
const PERIOD_OPTIONS: Array<{ label: string; value: Period }> = [
  { label: 'Сегодня', value: 'today' },
  { label: '7 дней', value: '7d' },
  { label: '30 дней', value: '30d' },
  { label: '90 дней', value: '90d' },
  { label: 'Всё время', value: 'all' },
];

export function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [selectedPage, setSelectedPage] = useState<string | null>('prayer');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'total_views' | 'sessions' | 'last_active'>('total_views');

  const overview = useQuery({
    queryKey: ['analytics', 'overview', period],
    queryFn: () => fetchAnalyticsOverview(period),
  });
  const pages = useQuery({
    queryKey: ['analytics', 'pages', period],
    queryFn: () => fetchAnalyticsPages(period),
  });
  const pageDetail = useQuery({
    queryKey: ['analytics', 'page-detail', selectedPage, period],
    queryFn: () => fetchAnalyticsPageDetail(selectedPage!, period),
    enabled: Boolean(selectedPage),
  });
  const topUsers = useQuery({
    queryKey: ['analytics', 'users', period, sortBy, selectedPage],
    queryFn: () => fetchAnalyticsUsers({ period, sort_by: sortBy, page_key: selectedPage ?? undefined }),
  });
  const realtime = useQuery({
    queryKey: ['analytics', 'realtime'],
    queryFn: fetchAnalyticsRealtime,
    refetchInterval: 30_000,
  });
  const userDetail = useQuery({
    queryKey: ['analytics', 'user', selectedUserId, period],
    queryFn: () => fetchAnalyticsUserDetail(selectedUserId!, period),
    enabled: selectedUserId != null,
  });

  useEffect(() => {
    if (!selectedPage && pages.data?.length) setSelectedPage(pages.data[0].page_key);
  }, [selectedPage, pages.data]);

  const deviceData = useMemo(() => {
    const raw = pageDetail.data?.views_by_device ?? {};
    return Object.entries(raw).map(([name, value]) => ({ name, value: Number(value) }));
  }, [pageDetail.data]);

  const osData = useMemo(() => {
    const raw = pageDetail.data?.views_by_os ?? {};
    return Object.entries(raw).map(([name, value]) => ({ name, value: Number(value) }));
  }, [pageDetail.data]);

  const hourHeat = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of pageDetail.data?.views_heatmap ?? []) {
      map.set(`${Number(item.day_of_week)}-${Number(item.hour)}`, Number(item.views));
    }
    const out: Array<{ day: number; hour: number; views: number }> = [];
    for (let day = 0; day < 7; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        out.push({
          day,
          hour,
          views: map.get(`${day}-${hour}`) ?? 0,
        });
      }
    }
    return out;
  }, [pageDetail.data]);
  const retentionData = useMemo(
    () => (overview.data?.retention ?? []).map((r: any) => ({ name: `D+${r.day}`, returned_percent: r.returned_percent })),
    [overview.data],
  );
  const overviewByDay = overview.data?.views_by_day ?? [];
  const pageByDay = pageDetail.data?.views_by_day ?? [];

  return (
    <div className="space-y-4 p-3 text-stone-200 md:p-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-stone-950/40 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Аналитика</h1>
          <p className="text-sm text-stone-400">Статистика по просмотрам, пользователям и активности.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PERIOD_OPTIONS.map((item) => (
            <button
              key={item.value}
              className={`rounded-lg px-3 py-1.5 text-sm ${period === item.value ? 'bg-primary text-white' : 'bg-stone-800 text-stone-300'}`}
              onClick={() => setPeriod(item.value)}
            >
              {item.label}
            </button>
          ))}
          <button className="rounded-lg bg-stone-700 px-3 py-1.5 text-sm" onClick={() => {
            void overview.refetch();
            void pages.refetch();
            void realtime.refetch();
          }}>Обновить</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <KpiCard title="Всего просмотров" value={overview.data?.total_views ?? 0} />
        <KpiCard title="Уникальных пользователей" value={overview.data?.unique_users ?? 0} />
        <KpiCard title="Сессий" value={overview.data?.unique_sessions ?? 0} />
        <KpiCard title="Ср. время на сайте (сек)" value={overview.data?.avg_session_duration ?? 0} />
        <KpiCard title="Сейчас онлайн" value={realtime.data?.online_count ?? 0} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-stone-950/40 p-4">
        <h2 className="mb-3 text-base font-semibold text-white">Просмотры по дням</h2>
        <ChartSkeleton loading={overview.isLoading}>
          {overviewByDay.length > 0 ? (
            <div style={{ width: '100%', height: 300, minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overviewByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="day" stroke="#a8a29e" />
                  <YAxis stroke="#a8a29e" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="views" stroke="#60a5fa" strokeWidth={2} name="Просмотры" />
                  <Line type="monotone" dataKey="unique_users" stroke="#34d399" strokeWidth={2} name="Уникальные" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <NoChartData />
          )}
        </ChartSkeleton>
      </div>

      <div className="rounded-2xl border border-white/10 bg-stone-950/40 p-4">
        <h2 className="mb-3 text-base font-semibold text-white">Retention (возврат пользователей)</h2>
        <ChartSkeleton loading={overview.isLoading}>
          {retentionData.length > 0 ? (
            <div style={{ width: '100%', height: 300, minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={retentionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#a8a29e" />
                  <YAxis stroke="#a8a29e" unit="%" />
                  <Tooltip />
                  <Line type="monotone" dataKey="returned_percent" stroke="#f472b6" strokeWidth={2} name="Вернулись, %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <NoChartData />
          )}
        </ChartSkeleton>
      </div>

      <div className="rounded-2xl border border-white/10 bg-stone-950/40 p-4">
        <h2 className="mb-3 text-base font-semibold text-white">Разделы</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-stone-400">
              <tr>
                <th className="px-2 py-2 text-left">Раздел</th>
                <th className="px-2 py-2 text-right">Просмотры</th>
                <th className="px-2 py-2 text-right">Уникальных</th>
                <th className="px-2 py-2 text-right">Ср. время</th>
                <th className="px-2 py-2 text-right">Тренд</th>
              </tr>
            </thead>
            <tbody>
              {(pages.data ?? []).map((p) => (
                <tr
                  key={p.page_key}
                  className={`cursor-pointer border-t border-white/5 ${selectedPage === p.page_key ? 'bg-primary/10' : ''}`}
                  onClick={() => setSelectedPage(p.page_key)}
                >
                  <td className="px-2 py-2 font-medium text-white">{p.page_name}</td>
                  <td className="px-2 py-2 text-right">{p.total_views}</td>
                  <td className="px-2 py-2 text-right">{p.unique_users}</td>
                  <td className="px-2 py-2 text-right">{Math.round(p.avg_duration_seconds ?? 0)}</td>
                  <td className={`px-2 py-2 text-right ${(p.views_trend ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {Number(p.views_trend ?? 0).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title={`Детально: ${pageDetail.data?.page_name ?? selectedPage ?? ''}`}>
          <ChartSkeleton loading={pageDetail.isLoading}>
            {pageByDay.length > 0 ? (
              <div style={{ width: '100%', height: 300, minWidth: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pageByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="day" stroke="#a8a29e" />
                    <YAxis stroke="#a8a29e" />
                    <Tooltip />
                    <Line type="monotone" dataKey="views" stroke="#f59e0b" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <NoChartData />
            )}
            <div className="mt-4">
              <div className="mb-2 grid grid-cols-12 gap-1 text-[10px] text-stone-400">
                <div className="col-span-1" />
                {Array.from({ length: 24 }).map((_, hour) => (
                  <div key={`h-label-${hour}`} className="text-center">{hour}</div>
                ))}
              </div>
              <div className="space-y-1">
                {Array.from({ length: 7 }).map((_, day) => (
                  <div key={`day-row-${day}`} className="grid grid-cols-[24px_repeat(24,minmax(0,1fr))] gap-1 items-center">
                    <div className="text-[10px] text-stone-400">{['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][day]}</div>
                    {hourHeat
                      .filter((cell) => cell.day === day)
                      .map((cell) => (
                        <div
                          key={`${cell.day}-${cell.hour}`}
                          title={`D${cell.day} ${cell.hour}:00 — ${cell.views}`}
                          className="h-4 rounded"
                          style={{ backgroundColor: `rgba(96,165,250,${Math.min(0.95, cell.views / 25 + 0.08)})` }}
                        />
                      ))}
                  </div>
                ))}
              </div>
            </div>
          </ChartSkeleton>
        </Panel>
        <Panel title="Устройства и ОС">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {deviceData.length > 0 ? (
              <div style={{ width: '100%', height: 300, minWidth: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={deviceData} dataKey="value" nameKey="name" outerRadius={70} fill="#60a5fa" />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <NoChartData />
            )}
            {osData.length > 0 ? (
              <div style={{ width: '100%', height: 300, minWidth: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={osData} dataKey="value" nameKey="name" outerRadius={70} fill="#34d399" />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <NoChartData />
            )}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Кто просматривал">
          <div className="max-h-80 overflow-auto">
            {(pageDetail.data?.viewers ?? []).map((viewer: any) => (
              <button
                key={viewer.user_id}
                className="flex w-full items-center justify-between border-b border-white/5 px-2 py-2 text-left hover:bg-white/5"
                onClick={() => setSelectedUserId(Number(viewer.user_id))}
              >
                <span>{viewer.name}</span>
                <span className="text-stone-400">{viewer.views_count}</span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Топ пользователей">
          <div className="mb-2 flex gap-2">
            <button className="rounded bg-stone-800 px-2 py-1 text-xs" onClick={() => setSortBy('total_views')}>По просмотрам</button>
            <button className="rounded bg-stone-800 px-2 py-1 text-xs" onClick={() => setSortBy('sessions')}>По сессиям</button>
            <button className="rounded bg-stone-800 px-2 py-1 text-xs" onClick={() => setSortBy('last_active')}>По активности</button>
          </div>
          <div className="max-h-80 overflow-auto">
            {(topUsers.data ?? []).map((u: any) => (
              <div key={u.user_id} className="flex items-center justify-between border-b border-white/5 px-2 py-2">
                <div>
                  <div className="text-white">{u.name}</div>
                  <div className="text-xs text-stone-400">{u.favorite_page_name ?? '—'}</div>
                </div>
                <div className="text-sm text-stone-300">{u.total_views}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Сейчас онлайн">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {(realtime.data?.users ?? []).map((u: any, idx: number) => (
            <div key={`${u.user_id ?? 'g'}-${idx}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <div className="text-white">{u.name}</div>
              <div className="text-stone-400">{u.current_page}</div>
            </div>
          ))}
        </div>
      </Panel>

      {selectedUserId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelectedUserId(null)}>
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-stone-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold text-white">Статистика пользователя</h3>
            {userDetail.isLoading ? (
              <div className="h-20 animate-pulse rounded bg-stone-800" />
            ) : (
              <div className="space-y-2 text-sm text-stone-300">
                <div>Имя: {userDetail.data?.user?.name ?? '—'}</div>
                <div>Просмотров: {userDetail.data?.total_views ?? 0}</div>
                <div>Сессий: {userDetail.data?.total_sessions ?? 0}</div>
                <div>Первый визит: {userDetail.data?.first_visit ?? '—'}</div>
                <div>Последний визит: {userDetail.data?.last_visit ?? '—'}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-stone-950/40 p-3">
      <div className="text-xs text-stone-400">{title}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-stone-950/40 p-4">
      <h2 className="mb-3 text-base font-semibold text-white">{title}</h2>
      {children}
    </div>
  );
}

function ChartSkeleton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl bg-stone-800/70" />;
  }
  return <>{children}</>;
}

function NoChartData() {
  return (
    <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
      Нет данных за выбранный период
    </div>
  );
}

export default AnalyticsPage;
