import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { fetchAnalyticsOverview, fetchAnalyticsPageDetail, fetchAnalyticsPages, fetchAnalyticsRealtime } from '../../api/analyticsApi';
import {
  AvatarInitials,
  ChartSkeleton,
  formatMinutesAgo,
  formatNumber,
  InlineApiError,
  is500Error,
  KpiCard,
  KpiSkeleton,
  NoChartData,
  Panel,
  PulseDot,
  SafeChart,
  SURFACE_CLASS,
  TOOLTIP_STYLE,
} from './components/analyticsUi';

type Period = 'today' | '7d' | '30d' | '90d' | 'all';

type RealtimeUser = {
  user_id?: number | null;
  name?: string | null;
  current_page?: string | null;
  last_seen_minutes?: number | null;
};

const PERIOD_OPTIONS: Array<{ label: string; value: Period }> = [
  { label: 'Сегодня', value: 'today' },
  { label: '7д', value: '7d' },
  { label: '30д', value: '30d' },
  { label: '90д', value: '90d' },
  { label: 'Всё время', value: 'all' },
];

const CHART_COLORS = ['#7a1f2e', '#b45e6e', '#dba8b3', '#8f2e40', '#6a1423'];
const TOP_SECTION_ICONS = ['📖', '🕊️', '🙏', '⭐', '📌', '📊'];

export function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [selectedPage, setSelectedPage] = useState<string | null>(null);

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

  const realtime = useQuery({
    queryKey: ['analytics', 'realtime'],
    queryFn: fetchAnalyticsRealtime,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!selectedPage && pages.data?.length) {
      setSelectedPage(pages.data[0].page_key);
    }
  }, [pages.data, selectedPage]);

  const isInitialLoading =
    (overview.isLoading && !overview.data) || (pages.isLoading && !pages.data) || (realtime.isLoading && !realtime.data);

  const overviewByDay = useMemo(() => {
    try {
      return (overview.data?.views_by_day ?? []).map((item: any) => ({
        day: item.day,
        views: Number(item.views ?? 0),
        unique_users: Number(item.unique_users ?? 0),
      }));
    } catch {
      return [];
    }
  }, [overview.data]);

  const retentionData = useMemo(() => {
    try {
      return (overview.data?.retention ?? []).map((item: any) => ({
        period: `D+${item.day}`,
        returned_percent: Number(item.returned_percent ?? 0),
      }));
    } catch {
      return [];
    }
  }, [overview.data]);

  const deviceData = useMemo(() => {
    try {
      const raw = pageDetail.data?.views_by_device ?? {};
      return Object.entries(raw).map(([name, value]) => ({
        name,
        value: Number(value ?? 0),
      }));
    } catch {
      return [];
    }
  }, [pageDetail.data]);

  const totalDeviceViews = deviceData.reduce((acc, item) => acc + item.value, 0);

  const topSections = useMemo(() => {
    try {
      const sorted = [...(pages.data ?? [])].sort((a, b) => Number(b.total_views ?? 0) - Number(a.total_views ?? 0));
      const max = Number(sorted[0]?.total_views ?? 0) || 1;
      return sorted.slice(0, 6).map((item, index) => ({
        key: item.page_key,
        name: item.page_name,
        views: Number(item.total_views ?? 0),
        percent: Math.round((Number(item.total_views ?? 0) / max) * 100),
        color: CHART_COLORS[index % CHART_COLORS.length],
        icon: TOP_SECTION_ICONS[index % TOP_SECTION_ICONS.length],
      }));
    } catch {
      return [];
    }
  }, [pages.data]);

  const selectedSectionName = useMemo(() => {
    const selected = topSections.find((section) => section.key === selectedPage);
    return selected?.name ?? pageDetail.data?.page_name ?? 'раздел';
  }, [pageDetail.data?.page_name, selectedPage, topSections]);

  const sectionViewers = useMemo(() => {
    try {
      return (pageDetail.data?.viewers ?? []).map((viewer: any) => ({
        userId: Number(viewer.user_id ?? 0),
        name: String(viewer.name ?? 'Неизвестный пользователь'),
        viewsCount: Number(viewer.views_count ?? 0),
      }));
    } catch {
      return [];
    }
  }, [pageDetail.data]);

  const onlineUsers = useMemo(() => {
    try {
      return (realtime.data?.users ?? []) as RealtimeUser[];
    } catch {
      return [];
    }
  }, [realtime.data]);

  const onlineShown = onlineUsers.slice(0, 5);
  const onlineRestCount = Math.max(onlineUsers.length - onlineShown.length, 0);
  const onlineCount = Number(realtime.data?.online_count ?? onlineUsers.length ?? 0);

  const retryAll = () => {
    void overview.refetch();
    void pages.refetch();
    void pageDetail.refetch();
    void realtime.refetch();
  };

  const hasApi500 = [overview.error, pages.error, pageDetail.error, realtime.error].some((error) => is500Error(error));

  const kpis = [
    {
      title: 'Просмотры',
      value: Number(overview.data?.total_views ?? 0),
      delta: Number(overview.data?.views_trend ?? 0),
    },
    {
      title: 'Пользователи',
      value: Number(overview.data?.unique_users ?? 0),
      delta: Number(overview.data?.users_trend ?? 0),
    },
    {
      title: 'Сессии',
      value: Number(overview.data?.unique_sessions ?? 0),
      delta: Number(overview.data?.sessions_trend ?? 0),
    },
    {
      title: 'Ср.время',
      value: Number(Math.round(overview.data?.avg_session_duration ?? 0)),
      delta: Number(overview.data?.duration_trend ?? 0),
      suffix: ' сек',
    },
    {
      title: 'Онлайн',
      value: onlineCount,
      delta: Number(realtime.data?.online_trend ?? 0),
      isOnline: true,
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-3 md:p-6" style={{ color: 'var(--color-text-primary)' }}>
      <div className={`flex flex-col gap-3 rounded-xl p-4 md:flex-row md:items-center md:justify-between ${SURFACE_CLASS}`}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Аналитика</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Пользователи, трафик, устройства и retention по периодам.</p>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
          {PERIOD_OPTIONS.map((item) => {
            const active = period === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setPeriod(item.value)}
                className="rounded-lg px-3 py-1.5 text-sm transition"
                style={{
                  backgroundColor: active ? '#7a1f2e' : 'var(--color-background-primary)',
                  color: active ? '#fff' : 'var(--color-text-secondary)',
                  border: active ? '2px solid #b45e6e' : '1px solid rgba(122,31,46,0.16)',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {hasApi500 && <InlineApiError onRetry={retryAll} />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {isInitialLoading
          ? Array.from({ length: 5 }).map((_, idx) => <KpiSkeleton key={`kpi-skeleton-${idx}`} />)
          : kpis.map((kpi) => (
              <KpiCard
                key={kpi.title}
                title={kpi.title}
                value={kpi.value}
                delta={kpi.delta}
                suffix={kpi.suffix}
                isOnline={kpi.isOnline}
              />
            ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Просмотры по дням" className="min-w-0 xl:col-span-2">
          <ChartSkeleton loading={overview.isLoading && !overview.data}>
            <SafeChart fallback={<NoChartData />}>
              {overviewByDay.length > 0 ? (
                <div style={{ width: '100%', height: 320, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={overviewByDay}>
                      <CartesianGrid stroke="rgba(180,94,110,0.2)" strokeDasharray="3 3" />
                      <XAxis dataKey="day" stroke="var(--color-text-muted)" />
                      <YAxis stroke="var(--color-text-muted)" />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatNumber(Number(value ?? 0))} />
                      <Line type="monotone" dataKey="views" name="Просмотры" stroke="#7a1f2e" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <NoChartData />
              )}
            </SafeChart>
          </ChartSkeleton>
        </Panel>

        <Panel title="Устройства" className="min-w-0">
          <ChartSkeleton loading={pageDetail.isLoading && !pageDetail.data}>
            <SafeChart fallback={<NoChartData />}>
              {deviceData.length > 0 ? (
                <div style={{ width: '100%', height: 320, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={deviceData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={95} paddingAngle={2}>
                        {deviceData.map((entry, index) => (
                          <Cell key={`${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => {
                          const normalized = Number(value ?? 0);
                          return `${formatNumber(normalized)} (${Math.round((normalized / Math.max(totalDeviceViews, 1)) * 100)}%)`;
                        }}
                        contentStyle={TOOLTIP_STYLE}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <NoChartData />
              )}
            </SafeChart>
          </ChartSkeleton>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Топ разделов" className="min-w-0">
          <ChartSkeleton loading={pages.isLoading && !pages.data}>
            {topSections.length === 0 ? (
              <NoChartData compact />
            ) : (
              <div className="space-y-3">
                {topSections.map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setSelectedPage(section.key)}
                    className={`w-full space-y-1.5 rounded-lg p-2 text-left transition ${
                      selectedPage === section.key
                        ? 'bg-[rgba(122,31,46,0.08)]'
                        : 'hover:bg-[rgba(122,31,46,0.04)]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 truncate">
                        <span>{section.icon}</span>
                        <span className="truncate text-[var(--color-text-primary)]">{section.name}</span>
                      </div>
                      <span className="text-[var(--color-text-secondary)]">{formatNumber(section.views)}</span>
                    </div>
                    <div className={`h-2.5 overflow-hidden rounded-full ${SURFACE_CLASS}`}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(3, section.percent)}%`, backgroundColor: section.color }}
                      />
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">{section.percent}% от лидера</div>
                  </button>
                ))}
              </div>
            )}
          </ChartSkeleton>
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              Онлайн сейчас
              <PulseDot />
            </span>
          }
          className="min-w-0"
        >
          <ChartSkeleton loading={realtime.isLoading && !realtime.data}>
            {onlineShown.length === 0 ? (
              <NoChartData compact />
            ) : (
              <div className="space-y-2">
                {onlineShown.map((user, index) => (
                  <div
                    key={`${user.user_id ?? 'guest'}-${index}`}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 ${SURFACE_CLASS}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <AvatarInitials name={user.name} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{user.name || 'Гость'}</div>
                        <div className="truncate text-xs text-[var(--color-text-muted)]">{user.current_page || 'Неизвестный раздел'}</div>
                      </div>
                    </div>
                    <div className="text-xs text-[var(--color-text-secondary)]">{formatMinutesAgo(user.last_seen_minutes)}</div>
                  </div>
                ))}
                {onlineRestCount > 0 ? (
                  <div className="pt-1 text-xs text-[var(--color-text-muted)]">ещё {formatNumber(onlineRestCount)} пользователей</div>
                ) : null}
              </div>
            )}
          </ChartSkeleton>
        </Panel>
      </div>

      <Panel title={`Кто посещал раздел: ${selectedSectionName}`} className="min-w-0">
        <ChartSkeleton loading={pageDetail.isLoading && !pageDetail.data}>
          {sectionViewers.length === 0 ? (
            <NoChartData compact />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-[color:var(--color-border,rgba(122,31,46,0.16))] bg-[rgba(122,31,46,0.04)] px-3 py-2 text-sm">
                <span className="text-[var(--color-text-secondary)]">
                  Всего людей в разделе
                </span>
                <span className="font-semibold">{formatNumber(Number(pageDetail.data?.unique_users ?? sectionViewers.length))}</span>
              </div>
              {sectionViewers.map((viewer: { userId: number; name: string; viewsCount: number }) => (
                <div
                  key={viewer.userId > 0 ? viewer.userId : viewer.name}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${SURFACE_CLASS}`}
                >
                  <div className="truncate text-sm font-medium">{viewer.name}</div>
                  <div className="text-sm text-[var(--color-text-secondary)]">
                    {formatNumber(viewer.viewsCount)} просмотров
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartSkeleton>
      </Panel>

      <Panel title="Retention" className="min-w-0">
        <ChartSkeleton loading={overview.isLoading && !overview.data}>
          <SafeChart fallback={<NoChartData />}>
            {retentionData.length > 0 ? (
              <div style={{ width: '100%', height: 280, minWidth: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={retentionData} layout="vertical" margin={{ left: 8, right: 20 }}>
                    <CartesianGrid stroke="rgba(180,94,110,0.18)" strokeDasharray="3 3" />
                    <XAxis type="number" stroke="var(--color-text-muted)" unit="%" />
                    <YAxis type="category" dataKey="period" stroke="var(--color-text-muted)" width={45} />
                    <Tooltip formatter={(value) => `${Number(value ?? 0).toFixed(1)}%`} contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="returned_percent" radius={[0, 8, 8, 0]}>
                      {retentionData.map((item: { period: string }, index: number) => (
                        <Cell key={`${item.period}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <NoChartData />
            )}
          </SafeChart>
        </ChartSkeleton>
      </Panel>
    </div>
  );
}

export default AnalyticsPage;
