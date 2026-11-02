import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipValueType,
  XAxis,
  YAxis,
} from 'recharts';

import { fetchAnalyticsPrayer } from '../../../api/analyticsApi';
import {
  AvatarInitials,
  ChartSkeleton,
  formatDateTime,
  formatDayTick,
  formatDuration,
  formatLongDuration,
  formatNumber,
  formatRole,
  InlineApiError,
  is500Error,
  KpiCard,
  KpiSkeleton,
  NoChartData,
  Panel,
  SafeChart,
  TOOLTIP_STYLE,
} from './analyticsUi';

type PrayerVisitor = {
  user_id: number;
  name: string;
  avatar?: string | null;
  role?: string | null;
  visits: number;
  total_time_seconds: number;
  avg_duration_seconds: number;
  last_viewed_at: string | null;
};

function tooltipNumber(value: TooltipValueType | undefined): number {
  return Number(value === undefined ? 0 : Array.isArray(value) ? value[0] : value);
}

export function AnalyticsPrayerTab({ period }: { period: string }) {
  const prayer = useQuery({
    queryKey: ['analytics', 'prayer', period],
    queryFn: () => fetchAnalyticsPrayer(period),
  });

  const byDay = useMemo(() => {
    try {
      return (prayer.data?.by_day ?? []).map((item: any) => ({
        day: item.day,
        visitors: Number(item.visitors ?? 0),
        views: Number(item.views ?? 0),
        minutes: Math.round(Number(item.total_time_seconds ?? 0) / 60),
      }));
    } catch {
      return [];
    }
  }, [prayer.data]);

  const visitors = useMemo(() => {
    try {
      return (prayer.data?.visitors ?? []) as PrayerVisitor[];
    } catch {
      return [];
    }
  }, [prayer.data]);

  const isInitialLoading = prayer.isLoading && !prayer.data;

  const kpis = [
    {
      title: 'Сегодня в молитве',
      value: Number(prayer.data?.today_visitors ?? 0),
      delta: 0,
    },
    {
      title: 'Уникальных за период',
      value: Number(prayer.data?.unique_visitors ?? 0),
      delta: 0,
    },
    {
      title: 'Суммарное время',
      value: Number(prayer.data?.total_time_seconds ?? 0),
      delta: 0,
      displayValue: formatLongDuration(Number(prayer.data?.total_time_seconds ?? 0)),
    },
    {
      title: 'Средний визит',
      value: Number(Math.round(prayer.data?.avg_duration_seconds ?? 0)),
      delta: 0,
      displayValue: formatDuration(Number(prayer.data?.avg_duration_seconds ?? 0)),
    },
  ];

  return (
    <div className="space-y-5">
      {is500Error(prayer.error) && <InlineApiError onRetry={() => void prayer.refetch()} />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {isInitialLoading
          ? Array.from({ length: 4 }).map((_, idx) => <KpiSkeleton key={`prayer-kpi-skeleton-${idx}`} />)
          : kpis.map((kpi) => (
              <KpiCard key={kpi.title} title={kpi.title} value={kpi.value} delta={kpi.delta} displayValue={kpi.displayValue} />
            ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Посетители молитвы по дням" className="min-w-0">
          <ChartSkeleton loading={isInitialLoading}>
            <SafeChart fallback={<NoChartData />}>
              {byDay.length > 0 ? (
                <div style={{ width: '100%', height: 280, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={byDay}>
                      <CartesianGrid stroke="rgba(180,94,110,0.2)" strokeDasharray="3 3" />
                      <XAxis dataKey="day" stroke="var(--color-text-muted)" tickFormatter={formatDayTick} />
                      <YAxis stroke="var(--color-text-muted)" allowDecimals={false} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: TooltipValueType | undefined) => formatNumber(tooltipNumber(value))}
                        labelFormatter={(label) => formatDayTick(label)}
                      />
                      <Line
                        type="monotone"
                        dataKey="visitors"
                        name="Посетители"
                        stroke="#7a1f2e"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <NoChartData />
              )}
            </SafeChart>
          </ChartSkeleton>
        </Panel>

        <Panel title="Время в молитве по дням (минуты)" className="min-w-0">
          <ChartSkeleton loading={isInitialLoading}>
            <SafeChart fallback={<NoChartData />}>
              {byDay.length > 0 ? (
                <div style={{ width: '100%', height: 280, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byDay}>
                      <CartesianGrid stroke="rgba(180,94,110,0.2)" strokeDasharray="3 3" />
                      <XAxis dataKey="day" stroke="var(--color-text-muted)" tickFormatter={formatDayTick} />
                      <YAxis stroke="var(--color-text-muted)" />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: TooltipValueType | undefined) => `${formatNumber(tooltipNumber(value))} мин`}
                        labelFormatter={(label) => formatDayTick(label)}
                      />
                      <Bar dataKey="minutes" name="Минуты" fill="#b45e6e" radius={[4, 4, 0, 0]} />
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

      <Panel title="Кто посещает молитву и сколько времени проводит" className="min-w-0">
        <ChartSkeleton loading={isInitialLoading}>
          {visitors.length === 0 ? (
            <NoChartData compact />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border,rgba(122,31,46,0.14))] text-left text-xs text-[var(--color-text-muted)]">
                    <th className="py-2 pr-3 font-medium">Пользователь</th>
                    <th className="py-2 pr-3 text-right font-medium">Визиты</th>
                    <th className="py-2 pr-3 text-right font-medium">Суммарное время</th>
                    <th className="py-2 pr-3 text-right font-medium">Средний визит</th>
                    <th className="py-2 text-right font-medium">Последний визит</th>
                  </tr>
                </thead>
                <tbody>
                  {visitors.map((visitor) => (
                    <tr key={visitor.user_id} className="border-b border-[color:var(--color-border,rgba(122,31,46,0.08))]">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2.5">
                          <AvatarInitials name={visitor.name} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-[var(--color-text-primary)]">{visitor.name}</div>
                            {visitor.role ? (
                              <div className="text-xs text-[var(--color-text-muted)]">{formatRole(visitor.role)}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right">{formatNumber(Number(visitor.visits ?? 0))}</td>
                      <td className="py-2 pr-3 text-right">{formatLongDuration(Number(visitor.total_time_seconds ?? 0))}</td>
                      <td className="py-2 pr-3 text-right">{formatDuration(Number(visitor.avg_duration_seconds ?? 0))}</td>
                      <td className="py-2 text-right text-[var(--color-text-secondary)]">
                        {formatDateTime(visitor.last_viewed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartSkeleton>
      </Panel>
    </div>
  );
}

export default AnalyticsPrayerTab;
