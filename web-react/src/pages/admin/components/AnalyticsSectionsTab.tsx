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
  type TooltipValueType,
  XAxis,
  YAxis,
} from 'recharts';

import { fetchAnalyticsPageDetail, fetchAnalyticsPages } from '../../../api/analyticsApi';
import {
  CHART_COLORS,
  ChartSkeleton,
  formatDateTime,
  formatDayTick,
  formatDuration,
  formatNumber,
  InlineApiError,
  is500Error,
  NoChartData,
  Panel,
  SafeChart,
  SURFACE_CLASS,
  TOOLTIP_STYLE,
} from './analyticsUi';

type SectionRow = {
  page_key: string;
  page_name: string;
  total_views: number;
  unique_users: number;
  avg_duration_seconds: number;
  views_trend: number;
};

type ViewerRow = {
  user_id: number;
  name: string;
  views_count: number;
  avg_duration_seconds: number;
  last_viewed_at: string | null;
};

const DOW_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

function tooltipNumber(value: TooltipValueType | undefined): number {
  return Number(value === undefined ? 0 : Array.isArray(value) ? value[0] : value);
}

export function AnalyticsSectionsTab({ period }: { period: string }) {
  const [selectedPage, setSelectedPage] = useState<string | null>(null);

  const pages = useQuery({
    queryKey: ['analytics', 'pages', period],
    queryFn: () => fetchAnalyticsPages(period),
  });

  const pageDetail = useQuery({
    queryKey: ['analytics', 'page-detail', selectedPage, period],
    queryFn: () => fetchAnalyticsPageDetail(selectedPage!, period),
    enabled: Boolean(selectedPage),
  });

  useEffect(() => {
    if (!selectedPage && pages.data?.length) {
      setSelectedPage(pages.data[0].page_key);
    }
  }, [pages.data, selectedPage]);

  const sections = useMemo(() => {
    try {
      return (pages.data ?? []) as SectionRow[];
    } catch {
      return [];
    }
  }, [pages.data]);

  const byDay = useMemo(() => {
    try {
      return (pageDetail.data?.views_by_day ?? []).map((item: any) => ({
        day: item.day,
        views: Number(item.views ?? 0),
      }));
    } catch {
      return [];
    }
  }, [pageDetail.data]);

  const byHour = useMemo<Array<{ hour: string; views: number }>>(() => {
    try {
      const raw = (pageDetail.data?.views_by_hour ?? []).map((item: any) => ({
        hour: Number(item.hour ?? 0),
        views: Number(item.views ?? 0),
      }));
      const map = new Map<number, number>(raw.map((item: { hour: number; views: number }) => [item.hour, item.views]));
      return Array.from({ length: 24 }, (_, hour) => ({ hour: `${hour}:00`, views: map.get(hour) ?? 0 }));
    } catch {
      return [];
    }
  }, [pageDetail.data]);

  const deviceData = useMemo(() => {
    try {
      const raw = pageDetail.data?.views_by_device ?? {};
      return Object.entries(raw).map(([name, value]) => ({ name, value: Number(value ?? 0) }));
    } catch {
      return [];
    }
  }, [pageDetail.data]);

  const heatmap = useMemo(() => {
    try {
      const raw = (pageDetail.data?.views_heatmap ?? []) as Array<{ day_of_week: number; hour: number; views: number }>;
      const cells = new Map<string, number>();
      let max = 0;
      for (const cell of raw) {
        const key = `${cell.day_of_week}-${cell.hour}`;
        const value = Number(cell.views ?? 0);
        cells.set(key, value);
        if (value > max) max = value;
      }
      return { cells, max };
    } catch {
      return { cells: new Map<string, number>(), max: 0 };
    }
  }, [pageDetail.data]);

  const viewers = useMemo(() => {
    try {
      return (pageDetail.data?.viewers ?? []) as ViewerRow[];
    } catch {
      return [];
    }
  }, [pageDetail.data]);

  const selectedSectionName = useMemo(() => {
    const selected = sections.find((section) => section.page_key === selectedPage);
    return selected?.page_name ?? pageDetail.data?.page_name ?? '';
  }, [sections, selectedPage, pageDetail.data?.page_name]);

  const totalDeviceViews = deviceData.reduce((acc, item) => acc + item.value, 0);
  const hasApi500 = [pages.error, pageDetail.error].some((error) => is500Error(error));

  const retryAll = () => {
    void pages.refetch();
    void pageDetail.refetch();
  };

  return (
    <div className="space-y-5">
      {hasApi500 && <InlineApiError onRetry={retryAll} />}

      <Panel title="Все разделы" className="min-w-0">
        <ChartSkeleton loading={pages.isLoading && !pages.data}>
          {sections.length === 0 ? (
            <NoChartData compact />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border,rgba(122,31,46,0.14))] text-left text-xs text-[var(--color-text-muted)]">
                    <th className="py-2 pr-3 font-medium">Раздел</th>
                    <th className="py-2 pr-3 text-right font-medium">Просмотры</th>
                    <th className="py-2 pr-3 text-right font-medium">Пользователи</th>
                    <th className="py-2 pr-3 text-right font-medium">Ср. время</th>
                    <th className="py-2 text-right font-medium">Тренд</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section) => {
                    const active = section.page_key === selectedPage;
                    const trend = Number(section.views_trend ?? 0);
                    return (
                      <tr
                        key={section.page_key}
                        onClick={() => setSelectedPage(section.page_key)}
                        className={`cursor-pointer border-b border-[color:var(--color-border,rgba(122,31,46,0.08))] transition ${
                          active ? 'bg-[rgba(122,31,46,0.08)]' : 'hover:bg-[rgba(122,31,46,0.04)]'
                        }`}
                      >
                        <td className="py-2.5 pr-3 font-medium text-[var(--color-text-primary)]">{section.page_name}</td>
                        <td className="py-2.5 pr-3 text-right">{formatNumber(Number(section.total_views ?? 0))}</td>
                        <td className="py-2.5 pr-3 text-right">{formatNumber(Number(section.unique_users ?? 0))}</td>
                        <td className="py-2.5 pr-3 text-right">{formatDuration(Number(section.avg_duration_seconds ?? 0))}</td>
                        <td className={`py-2.5 text-right ${trend >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ChartSkeleton>
      </Panel>

      {selectedPage ? (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title={`${selectedSectionName}: просмотры по дням`} className="min-w-0">
              <ChartSkeleton loading={pageDetail.isLoading && !pageDetail.data}>
                <SafeChart fallback={<NoChartData />}>
                  {byDay.length > 0 ? (
                    <div style={{ width: '100%', height: 260, minWidth: 0 }}>
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

            <Panel title={`${selectedSectionName}: по часам`} className="min-w-0">
              <ChartSkeleton loading={pageDetail.isLoading && !pageDetail.data}>
                <SafeChart fallback={<NoChartData />}>
                  {byHour.some((item) => item.views > 0) ? (
                    <div style={{ width: '100%', height: 260, minWidth: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={byHour}>
                          <CartesianGrid stroke="rgba(180,94,110,0.2)" strokeDasharray="3 3" />
                          <XAxis dataKey="hour" stroke="var(--color-text-muted)" interval={2} />
                          <YAxis stroke="var(--color-text-muted)" />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(value: TooltipValueType | undefined) => formatNumber(tooltipNumber(value))}
                          />
                          <Bar dataKey="views" name="Просмотры" fill="#b45e6e" radius={[4, 4, 0, 0]} />
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

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title={`${selectedSectionName}: активность по дням недели и часам`} className="min-w-0">
              <ChartSkeleton loading={pageDetail.isLoading && !pageDetail.data}>
                {heatmap.max === 0 ? (
                  <NoChartData compact />
                ) : (
                  <div className="space-y-1 overflow-x-auto">
                    {DOW_ORDER.map((dow) => (
                      <div key={dow} className="flex items-center gap-1">
                        <div className="w-7 shrink-0 text-xs text-[var(--color-text-muted)]">{DOW_LABELS[dow]}</div>
                        {Array.from({ length: 24 }, (_, hour) => {
                          const value = heatmap.cells.get(`${dow}-${hour}`) ?? 0;
                          const opacity = value <= 0 ? 0.05 : Math.max(0.12, value / heatmap.max);
                          return (
                            <div
                              key={hour}
                              title={`${DOW_LABELS[dow]} ${hour}:00 — ${formatNumber(value)} просмотров`}
                              className="h-4 min-w-[10px] flex-1 rounded-[3px]"
                              style={{ backgroundColor: `rgba(122,31,46,${opacity.toFixed(2)})` }}
                            />
                          );
                        })}
                      </div>
                    ))}
                    <div className="flex items-center gap-1 pt-1 text-[10px] text-[var(--color-text-muted)]">
                      <div className="w-7 shrink-0" />
                      {Array.from({ length: 24 }, (_, hour) => (
                        <div key={hour} className="min-w-[10px] flex-1 text-center">
                          {hour % 6 === 0 ? hour : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ChartSkeleton>
            </Panel>

            <Panel title={`${selectedSectionName}: устройства`} className="min-w-0">
              <ChartSkeleton loading={pageDetail.isLoading && !pageDetail.data}>
                <SafeChart fallback={<NoChartData />}>
                  {deviceData.length > 0 ? (
                    <div style={{ width: '100%', height: 260, minWidth: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={deviceData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={90} paddingAngle={2}>
                            {deviceData.map((entry, index) => (
                              <Cell key={`${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: TooltipValueType | undefined) => {
                              const normalized = tooltipNumber(value);
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

          <Panel title={`Кто посещал раздел: ${selectedSectionName}`} className="min-w-0">
            <ChartSkeleton loading={pageDetail.isLoading && !pageDetail.data}>
              {viewers.length === 0 ? (
                <NoChartData compact />
              ) : (
                <div className="space-y-2">
                  <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${SURFACE_CLASS}`}>
                    <span className="text-[var(--color-text-secondary)]">Всего людей в разделе</span>
                    <span className="font-semibold">
                      {formatNumber(Number(pageDetail.data?.unique_users ?? viewers.length))}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-[color:var(--color-border,rgba(122,31,46,0.14))] text-left text-xs text-[var(--color-text-muted)]">
                          <th className="py-2 pr-3 font-medium">Пользователь</th>
                          <th className="py-2 pr-3 text-right font-medium">Визиты</th>
                          <th className="py-2 pr-3 text-right font-medium">Ср. время</th>
                          <th className="py-2 text-right font-medium">Последний визит</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewers.map((viewer) => (
                          <tr
                            key={viewer.user_id}
                            className="border-b border-[color:var(--color-border,rgba(122,31,46,0.08))]"
                          >
                            <td className="py-2 pr-3 font-medium text-[var(--color-text-primary)]">{viewer.name}</td>
                            <td className="py-2 pr-3 text-right">{formatNumber(Number(viewer.views_count ?? 0))}</td>
                            <td className="py-2 pr-3 text-right">{formatDuration(Number(viewer.avg_duration_seconds ?? 0))}</td>
                            <td className="py-2 text-right text-[var(--color-text-secondary)]">
                              {formatDateTime(viewer.last_viewed_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </ChartSkeleton>
          </Panel>
        </>
      ) : null}
    </div>
  );
}

export default AnalyticsSectionsTab;
