import { useState } from 'react';

import { SectionHeroChrome } from '@/components/SectionHeroChrome';

import AnalyticsOverviewTab from './components/AnalyticsOverviewTab';
import AnalyticsPrayerTab from './components/AnalyticsPrayerTab';
import AnalyticsSectionsTab from './components/AnalyticsSectionsTab';
import AnalyticsUsersTab from './components/AnalyticsUsersTab';
import { SURFACE_CLASS } from './components/analyticsUi';

type Period = 'today' | '7d' | '30d' | '90d' | 'all';
type TabKey = 'overview' | 'sections' | 'users' | 'prayer';

const PERIOD_OPTIONS: Array<{ label: string; value: Period }> = [
  { label: 'Сегодня', value: 'today' },
  { label: '7д', value: '7d' },
  { label: '30д', value: '30d' },
  { label: '90д', value: '90d' },
  { label: 'Всё время', value: 'all' },
];

const TAB_OPTIONS: Array<{ label: string; value: TabKey }> = [
  { label: 'Обзор', value: 'overview' },
  { label: 'Разделы', value: 'sections' },
  { label: 'Пользователи', value: 'users' },
  { label: 'Молитва', value: 'prayer' },
];

export function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [tab, setTab] = useState<TabKey>('overview');

  return (
    <div className="space-y-5 pb-6" style={{ color: 'var(--color-text-primary)' }}>
      <SectionHeroChrome title="Аналитика" />
      <div className="mx-auto max-w-[1500px] space-y-5 px-3 md:px-6">
        <div className={`flex flex-wrap items-center gap-2 rounded-xl p-3 sm:p-4 ${SURFACE_CLASS}`}>
          <div className="flex flex-wrap gap-1.5">
            {TAB_OPTIONS.map((item) => {
              const active = tab === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setTab(item.value)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium transition"
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
          <div className="ms-auto flex flex-wrap gap-1.5">
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

        {tab === 'overview' ? <AnalyticsOverviewTab period={period} /> : null}
        {tab === 'sections' ? <AnalyticsSectionsTab period={period} /> : null}
        {tab === 'users' ? <AnalyticsUsersTab period={period} /> : null}
        {tab === 'prayer' ? <AnalyticsPrayerTab period={period} /> : null}
      </div>
    </div>
  );
}

export default AnalyticsPage;
