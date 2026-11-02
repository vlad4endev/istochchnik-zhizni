import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipValueType,
  XAxis,
  YAxis,
} from 'recharts';

import { downloadAnalyticsCsv, fetchAnalyticsOverview, fetchAnalyticsRealtime } from '../../../api/analyticsApi';
import {
  AvatarInitials,
  CHART_COLORS,
  ChartSkeleton,
  formatDayTick,
  formatDuration,
  formatMinutesAgo,
  formatNumber,
  formatPlatform,
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
} from './analyticsUi';

type RealtimeUser = {
  user_id?: number | null;
  name?: string | null;
  current_page?: string | null;
  current_page_name?: string | null;
  last_seen_minutes?: number | null;
};

function tooltipNumber(value: TooltipValueType | undefined): number {
  return Number(value === undefined ? 0 : Array.isArray(value) ? value[0] : value);
}

export function AnalyticsOverviewTab({ period }: { period: string }) {
  const [exporting, setExporting] = useState(false);

  const overview = useQuery({
    queryKey: ['analytics', 'overview', period],
    queryFn: () => fetchAnalyticsOverview(period),
  });

  const realtime = useQuery({
    queryKey: ['analytics', 'realtime'],
    queryFn: fetchAnalyticsRealtime,
    refetchInterval: 30_000,
  });

  const byDay = useMemo(() => {
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

  const platformData = useMemo<Array<{ name: string; value: number; views: number }>>(() => {
    try {
      return (overview.data?.users_by_platform ?? []).map((item: any) => ({
        name: formatPlatform(item.platform),
        value: Number(item.unique_users ?? 0),
        views: Number(item.views ?? 0),
      }));
    } catch {
      return [];
    }
  }, [overview.data]);

  const onlineUsers = useMemo(() => {
    try {
      return (realtime.data?.users ?? []) as RealtimeUser[];
    } catch {
      return [];
    }
  }, [realtime.data]);

  const onlineShown = onlineUsers.slice(0, 8);
  const onlineRestCount = Math.max(onlineUsers.length - onlineShown.length, 0);
  const onlineCount = Number(realtime.data?.online_count ?? onlineUsers.length ?? 0);

  const newUsers = Number(overview.data?.new_vs_returning?.new ?? 0);
  const returningUsers = Number(overview.data?.new_vs_returning?.returning ?? 0);
  const newVsReturningTotal = Math.max(newUsers + returningUsers, 1);

  const isInitialLoading = (overview.isLoading && !overview.data) || (realtime.isLoading && !realtime.data);
  const hasApi500 = [overview.error, realtime.error].some((error) => is500Error(error));

  const retryAll = () => {
    void overview.refetch();
    void realtime.refetch();
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadAnalyticsCsv(period);
    } catch {
      // toast об ошибке покажет apiClient
    } finally {
      setExporting(false);
    }
  };

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
      title: 'Ср. время',
      value: Number(Math.round(overview.data?.avg_session_duration ?? 0)),
      delta: Number(overview.data?.duration_trend ?? 0),
      displayValue: formatDuration(Number(overview.data?.avg_session_duration ?? 0)),
    },
    {
      title: 'Онлайн',
      value: onlineCount,
      delta: 0,
      isOnline: true,
    },
  ];

  return (
    <div className="space-y-5">
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
                displayValue={kpi.displayValue}
                isOnline={kpi.isOnline}
              />
            ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Активные пользователи по дням" className="min-w-0">
          <ChartSkeleton loading={overview.isLoading && !overview.data}>
            <SafeChart fallback={<NoChartData />}>
              {byDay.length > 0 ? (
                <div style={{ width: '100%', height: 300, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={byDay}>
                      <CartesianGrid stroke="rgba(180,94,110,0.2)" strokeDasharray="3 3" />
                      <XAxis dataKey="day" stroke="var(--color-text-muted)" tickFormatter={formatDayTick} />
                      <YAxis stroke="var(--color-text-muted)" allowDecimals={false} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: TooltipValueType | undefined) => formatNumber(tooltipNumber(value))}
                        labelFormatter={(label) => formatDayTick(label)}
                      />
                      <Area
                        type="monotone"
                        dataKey="unique_users"
                        name="Пользователи"
                        stroke="#7a1f2e"
                        fill="#7a1f2e"
                        fillOpacity={0.18}
                        strokeWidth={2.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <NoChartData />
              )}
            </SafeChart>
          </ChartSkeleton>
        </Panel>

        <Panel title="Просмотры по дням" className="min-w-0">
          <ChartSkeleton loading={overview.isLoading && !overview.data}>
            <SafeChart fallback={<NoChartData />}>
              {byDay.length > 0 ? (
                <div style={{ width: '100%', height: 300, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={byDay}>
                      <CartesianGrid stroke="rgba(180,94,110,0.2)" strokeDasharray="3 3" />
                      <XAxis dataKey="day" stroke="var(--color-text-muted)" tickFormatter={formatDayTick} />
                      <YAxis stroke="var(--color-text-muted)" />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: TooltipValueType | undefined) => formatNumber(tooltipNumber(value))}
                        labelFormatter={(label) => formatDayTick(label)}
                      />
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
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Новые и вернувшиеся" className="min-w-0">
          <ChartSkeleton loading={overview.isLoading && !overview.data}>
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-xs text-[var(--color-text-muted)]">Новые</div>
                  <div className="text-2xl font-semibold text-emerald-500">{formatNumber(newUsers)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[var(--color-text-muted)]">Вернувшиеся</div>
                  <div className="text-2xl font-semibold text-[#7a1f2e]">{formatNumber(returningUsers)}</div>
                </div>
              </div>
              <div className={`flex h-3 overflow-hidden rounded-full ${SURFACE_CLASS}`}>
                <div
                  className="h-full bg-emerald-500/80 transition-all"
                  style={{ width: `${Math.round((newUsers / newVsReturningTotal) * 100)}%` }}
                />
                <div
                  className="h-full bg-[#7a1f2e]/80 transition-all"
                  style={{ width: `${Math.round((returningUsers / newVsReturningTotal) * 100)}%` }}
                />
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                {Math.round((newUsers / newVsReturningTotal) * 100)}% новых за период
              </div>
            </div>
          </ChartSkeleton>
        </Panel>

        <Panel title="Платформы" className="min-w-0">
          <ChartSkeleton loading={overview.isLoading && !overview.data}>
            {platformData.length === 0 ? (
              <NoChartData compact />
            ) : (
              <div className="space-y-3">
                {platformData.map((item, index) => {
                  const max = Math.max(...platformData.map((p) => p.value), 1);
                  return (
                    <div key={item.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--color-text-primary)]">{item.name}</span>
                        <span className="text-[var(--color-text-secondary)]">
                          {formatNumber(item.value)} чел. · {formatNumber(item.views)} просм.
                        </span>
                      </div>
                      <div className={`h-2.5 overflow-hidden rounded-full ${SURFACE_CLASS}`}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(3, Math.round((item.value / max) * 100))}%`,
                            backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
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
                        <div className="truncate text-xs text-[var(--color-text-muted)]">
                          {user.current_page_name || 'Неизвестный раздел'}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-xs text-[var(--color-text-secondary)]">
                      {formatMinutesAgo(user.last_seen_minutes)}
                    </div>
                  </div>
                ))}
                {onlineRestCount > 0 ? (
                  <div className="pt-1 text-xs text-[var(--color-text-muted)]">
                    ещё {formatNumber(onlineRestCount)} пользователей
                  </div>
                ) : null}
              </div>
            )}
          </ChartSkeleton>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Retention (возврат после первого визита)" className="min-w-0 xl:col-span-2">
          <ChartSkeleton loading={overview.isLoading && !overview.data}>
            <SafeChart fallback={<NoChartData />}>
              {retentionData.length > 0 ? (
                <div style={{ width: '100%', height: 260, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={retentionData} layout="vertical" margin={{ left: 8, right: 20 }}>
                      <CartesianGrid stroke="rgba(180,94,110,0.18)" strokeDasharray="3 3" />
                      <XAxis type="number" stroke="var(--color-text-muted)" unit="%" />
                      <YAxis type="category" dataKey="period" stroke="var(--color-text-muted)" width={45} />
                      <Tooltip
                        formatter={(value: TooltipValueType | undefined) => `${tooltipNumber(value).toFixed(1)}%`}
                        contentStyle={TOOLTIP_STYLE}
                      />
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

        <Panel title="Экспорт данных" className="min-w-0">
          <div className="flex h-full flex-col justify-between gap-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Выгрузка сырых данных о посещениях за выбранный период в формате CSV (до 100 000 строк).
            </p>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting}
              className="w-fit rounded-lg bg-[#7a1f2e] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {exporting ? 'Формируем файл…' : 'Скачать CSV'}
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default AnalyticsOverviewTab;
