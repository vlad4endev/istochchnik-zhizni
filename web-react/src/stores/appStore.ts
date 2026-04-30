import { create } from 'zustand';

import { fetchActiveBroadcast, type BroadcastData } from '@/api/broadcast';
import { fetchMe, type MeResponse } from '@/features/profile/api';
import { getCalendarDay, formatCalendarDayKey, getWeekBirthdays, type BirthdayWeekItem } from '@/features/calendar/api';

type AppStoreState = {
  me: MeResponse | null;
  todayBirthdays: BirthdayWeekItem[];
  todayPrayerMember: string | null;
  activeBroadcast: BroadcastData | null;
  initialized: boolean;
  initialize: () => Promise<void>;
  startBroadcastPolling: () => void;
};

let broadcastPollTimer: number | null = null;

export const useAppStore = create<AppStoreState>((set, get) => ({
  me: null,
  todayBirthdays: [],
  todayPrayerMember: null,
  activeBroadcast: null,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    const today = formatCalendarDayKey(new Date());
    const [me, birthdays, prayer, broadcast] = await Promise.all([
      fetchMe(),
      getWeekBirthdays(),
      getCalendarDay(today),
      fetchActiveBroadcast(),
    ]);
    set({
      me,
      todayBirthdays: birthdays.items,
      todayPrayerMember: prayer?.members?.[0]?.name ?? null,
      activeBroadcast: broadcast.broadcast ?? null,
      initialized: true,
    });
  },

  startBroadcastPolling: () => {
    if (broadcastPollTimer != null) return;
    broadcastPollTimer = window.setInterval(async () => {
      try {
        const next = await fetchActiveBroadcast();
        set({ activeBroadcast: next.broadcast ?? null });
      } catch {
        // Keep stale broadcast in place on transient errors.
      }
    }, 5_000);
  },
}));
