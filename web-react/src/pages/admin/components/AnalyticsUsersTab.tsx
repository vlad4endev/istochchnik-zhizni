import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipValueType,
  XAxis,
  YAxis,
} from 'recharts';

import { AppSheet } from '@/components/ui/AppSheet';

import { fetchAnalyticsUserDetail, fetchAnalyticsUsers } from '../../../api/analyticsApi';
import {
  AvatarInitials,
  ChartSkeleton,
  formatDateTime,
  formatDayTick,
  formatLongDuration,
  formatNumber,
  formatRole,
  InlineApiError,
  is500Error,
  NoChartData,
  Panel,
  SafeChart,
  SURFACE_CLASS,
  TOOLTIP_STYLE,
} from './analyticsUi';

type UserRow = {
  user_id: number;
  name: string;
  avatar?: string | null;
  role?: string | null;
  total_views: number;
  sessions: number;
  total_time_seconds: number;
  last_active: string | null;
  favorite_page_name?: string | null;
};

type UserSection = {
  page_key: string;
  page_name: string;
  views: number;
  total_time_seconds: number;
  last_viewed_at: string | null;
};

type SortBy = 'total_views' | 'sessions' | 'last_active';

const SORT_OPTIONS: Array<{ label: string; value: SortBy }> = [
  { label: 'По просмотрам', value: 'total_views' },
  { label: 'По сессиям', value: 'sessions' },
  { label: 'По активности', value: 'last_active' },
];

function tooltipNumber(value: TooltipValueType | undefined): number {
  return Number(value === undefined ? 0 : Array.isArray(value) ? value[0] : value);
}

export function AnalyticsUsersTab({ period }: { period: string }) {
  const [sortBy, setSortBy] = useState<SortBy>('total_views');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const users = useQuery({
    queryKey: ['analytics', 'users', period, sortBy],
    queryFn: () => fetchAnalyticsUsers({ period, sort_by: sortBy }),
  });

  const userDetail = useQuery({
    queryKey: ['analytics', 'user-detail', selectedUserId, period],
    queryFn: () => fetchAnalyticsUserDetail(selectedUserId!, period),
    enabled: selectedUserId != null,
  });

  const rows = useMemo(() => {
    try {
      return (users.data ?? []) as UserRow[];
    } catch {
      return [];
    }
  }, [users.data]);

  const detailSections = useMemo(() => {
    try {
      return (userDetail.data?.sections ?? []) as UserSection[];
    } catch {
      return [];
    }
  }, [userDetail.data]);

  const detailByDay = useMemo(() => {
    try {
      return (userDetail.data?.activity_by_day ?? []).map((item: any) => ({
        day: item.day,
        views: Number(item.views ?? 0),
      }));
    } catch {
      return [];
    }
  }, [userDetail.data]);

  const detailUser = userDetail.data?.user;
  const detailMaxTime = Math.max(...detailSections.map((s) => Number(s.total_time_seconds ?? 0)), 1);
  const hasApi500 = [users.error, userDetail.error].some((error) => is500Error(error));

  const retryAll = () => {
    void users.refetch();
    void userDetail.refetch();
  };

  return (
    <div className="space-y-5">
      {hasApi500 && <InlineApiError onRetry={retryAll} />}

      <Panel
        title={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Активность пользователей</span>
            <div className="flex gap-1.5">
              {SORT_OPTIONS.map((option) => {
                const active = sortBy === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSortBy(option.value)}
                    className="rounded-lg px-2.5 py-1 text-xs transition"
                    style={{
                      backgroundColor: active ? '#7a1f2e' : 'var(--color-background-primary)',
                      color: active ? '#fff' : 'var(--color-text-secondary)',
                      border: active ? '1px solid #b45e6e' : '1px solid rgba(122,31,46,0.16)',
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        }
        className="min-w-0"
      >
        <ChartSkeleton loading={users.isLoading && !users.data}>
          {rows.length === 0 ? (
            <NoChartData compact />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border,rgba(122,31,46,0.14))] text-left text-xs text-[var(--color-text-muted)]">
                    <th className="py-2 pr-3 font-medium">Пользователь</th>
                    <th className="py-2 pr-3 text-right font-medium">Просмотры</th>
                    <th className="py-2 pr-3 text-right font-medium">Сессии</th>
                    <th className="py-2 pr-3 text-right font-medium">Время в приложении</th>
                    <th className="py-2 pr-3 font-medium">Чаще всего</th>
                    <th className="py-2 text-right font-medium">Был(а) в сети</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.user_id}
                      onClick={() => setSelectedUserId(row.user_id)}
                      className="cursor-pointer border-b border-[color:var(--color-border,rgba(122,31,46,0.08))] transition hover:bg-[rgba(122,31,46,0.04)]"
                    >
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2.5">
                          <AvatarInitials name={row.name} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-[var(--color-text-primary)]">{row.name}</div>
                            {row.role ? (
                              <div className="text-xs text-[var(--color-text-muted)]">{formatRole(row.role)}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right">{formatNumber(Number(row.total_views ?? 0))}</td>
                      <td className="py-2 pr-3 text-right">{formatNumber(Number(row.sessions ?? 0))}</td>
                      <td className="py-2 pr-3 text-right">{formatLongDuration(Number(row.total_time_seconds ?? 0))}</td>
                      <td className="py-2 pr-3 text-[var(--color-text-secondary)]">{row.favorite_page_name ?? '—'}</td>
                      <td className="py-2 text-right text-[var(--color-text-secondary)]">{formatDateTime(row.last_active)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartSkeleton>
      </Panel>

      {selectedUserId != null ? (
        <AppSheet
          title={detailUser?.name ?? `#${selectedUserId}`}
          subtitle={`${formatRole(detailUser?.app_role) || 'Пользователь'} · за период: ${formatNumber(Number(userDetail.data?.total_views ?? 0))} просмотров, ${formatNumber(Number(userDetail.data?.total_sessions ?? 0))} сессий`}
          onClose={() => setSelectedUserId(null)}
          size="wide"
        >
          <ChartSkeleton loading={userDetail.isLoading && !userDetail.data}>
            <div className="space-y-5">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Время по разделам</h3>
                {detailSections.length === 0 ? (
                  <NoChartData compact />
                ) : (
                  <div className="space-y-2">
                    {detailSections.map((section) => (
                      <div key={section.page_key} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate text-[var(--color-text-primary)]">{section.page_name}</span>
                          <span className="shrink-0 text-[var(--color-text-secondary)]">
                            {formatLongDuration(Number(section.total_time_seconds ?? 0))} ·{' '}
                            {formatNumber(Number(section.views ?? 0))} виз.
                          </span>
                        </div>
                        <div className={`h-2 overflow-hidden rounded-full ${SURFACE_CLASS}`}>
                          <div
                            className="h-full rounded-full bg-[#7a1f2e] transition-all"
                            style={{
                              width: `${Math.max(3, Math.round((Number(section.total_time_seconds ?? 0) / detailMaxTime) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Активность по дням</h3>
                <SafeChart fallback={<NoChartData compact />}>
                  {detailByDay.length > 0 ? (
                    <div style={{ width: '100%', height: 200, minWidth: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={detailByDay}>
                          <CartesianGrid stroke="rgba(180,94,110,0.2)" strokeDasharray="3 3" />
                          <XAxis dataKey="day" stroke="var(--color-text-muted)" tickFormatter={formatDayTick} />
                          <YAxis stroke="var(--color-text-muted)" />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(value: TooltipValueType | undefined) => formatNumber(tooltipNumber(value))}
                            labelFormatter={(label) => formatDayTick(label)}
                          />
                          <Line type="monotone" dataKey="views" name="Просмотры" stroke="#7a1f2e" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <NoChartData compact />
                  )}
                </SafeChart>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div className={`rounded-lg px-3 py-2 ${SURFACE_CLASS}`}>
                  <div className="text-xs text-[var(--color-text-muted)]">Первый визит</div>
                  <div className="font-medium">{formatDateTime(userDetail.data?.first_visit)}</div>
                </div>
                <div className={`rounded-lg px-3 py-2 ${SURFACE_CLASS}`}>
                  <div className="text-xs text-[var(--color-text-muted)]">Последний визит</div>
                  <div className="font-medium">{formatDateTime(userDetail.data?.last_visit)}</div>
                </div>
                <div className={`col-span-2 rounded-lg px-3 py-2 sm:col-span-1 ${SURFACE_CLASS}`}>
                  <div className="text-xs text-[var(--color-text-muted)]">Устройства</div>
                  <div className="font-medium">
                    {(userDetail.data?.devices ?? [])
                      .map((d: any) => `${d.device_type} (${formatNumber(Number(d.views ?? 0))})`)
                      .join(', ') || '—'}
                  </div>
                </div>
              </div>
            </div>
          </ChartSkeleton>
        </AppSheet>
      ) : null}
    </div>
  );
}

export default AnalyticsUsersTab;
