import DashboardHeader from './DashboardHeader';
import QuickActions from './QuickActions';
import SermonWidget from './SermonWidget';
import ProfileCard from './ProfileCard';
import BirthdayCard from './BirthdayCard';
import PrayerCard from './PrayerCard';
import AnnouncementBanner from './AnnouncementBanner';
import EventsFeed from './EventsFeed';
import { useDashboardData } from '../hooks/useDashboardData';
import { sectionHeroStickyClassNested } from '@/lib/sectionHeroChrome';

export default function DashboardPage() {
  const data = useDashboardData();
  const hasSermon = Boolean(data.sermon);
  const hasAnnouncement = Boolean(data.announcement);

  if (data.isLoading) {
    return (
      <div className="dashboard-adaptive flex min-h-0 flex-1 flex-col bg-[var(--surface)]">
        <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 md:px-6 lg:px-8 xl:px-10">
          <section className="rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] p-5 text-sm text-stone-600 shadow-[var(--shadow-card)]">
            Загрузка данных дашборда...
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-adaptive flex min-h-0 flex-1 flex-col bg-[var(--surface)]">
      <div className={sectionHeroStickyClassNested}>
        <div className="mx-auto w-full max-w-7xl">
          <DashboardHeader user={data.profile} notificationsCount={data.unreadCount} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 md:px-6 lg:px-8 xl:px-10">
        <div className="flex flex-col gap-3 md:hidden">
          <QuickActions />
          {hasSermon ? <SermonWidget {...data.sermon} /> : null}
          <ProfileCard user={data.profile} />
          {hasAnnouncement ? <AnnouncementBanner announcement={data.announcement} /> : null}
          <PrayerCard prayers={data.prayers} unreadCount={data.unreadCount} />
          <BirthdayCard birthdays={data.birthdays} />
          <EventsFeed events={data.events} />
        </div>

        <div className="hidden gap-4 md:grid lg:hidden md:grid-cols-2">
          <div>{hasSermon ? <SermonWidget {...data.sermon} /> : <ProfileCard user={data.profile} />}</div>
          <div className={hasSermon ? '' : 'md:col-start-2'}>
            <ProfileCard user={data.profile} />
          </div>
          <BirthdayCard birthdays={data.birthdays} />
          <PrayerCard prayers={data.prayers} unreadCount={data.unreadCount} />
          {hasAnnouncement ? <div className="md:col-span-2"><AnnouncementBanner announcement={data.announcement} /></div> : null}
          <div className="md:col-span-2">
            <EventsFeed events={data.events} />
          </div>
        </div>

        <div className="hidden gap-4 lg:grid lg:grid-cols-4">
          {hasSermon ? (
            <SermonWidget {...data.sermon} />
          ) : (
            <div className="lg:col-span-2">
              <ProfileCard user={data.profile} />
            </div>
          )}
          {hasSermon ? <ProfileCard user={data.profile} /> : null}
          <BirthdayCard birthdays={data.birthdays} />
          <PrayerCard prayers={data.prayers} unreadCount={data.unreadCount} />
          {hasAnnouncement ? (
            <div className="lg:col-span-4">
              <AnnouncementBanner announcement={data.announcement} />
            </div>
          ) : null}
          <div className="lg:col-span-4">
            <EventsFeed events={data.events} />
          </div>
        </div>
      </div>
    </div>
  );
}
