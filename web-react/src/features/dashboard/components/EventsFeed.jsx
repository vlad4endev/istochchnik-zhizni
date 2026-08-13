import { Link } from 'react-router-dom';
import { LuCalendarDays, LuPlay, LuVideo } from 'react-icons/lu';

function FeedCard({ icon: Icon, title, description, status, link }) {
  return (
    <article className="min-w-[250px] rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <h4 className="truncate text-sm font-extrabold text-stone-900">{title}</h4>
      </div>
      <p className="mt-2 text-sm text-stone-700">{description}</p>
      <p className="mt-2 text-xs font-semibold text-stone-500">{status}</p>
      <Link to={link} className="mt-3 inline-flex min-h-[36px] items-center rounded-xl bg-stone-100 px-3 text-sm font-semibold text-stone-700">
        Открыть
      </Link>
    </article>
  );
}

export default function EventsFeed({ events }) {
  const streamStatus = events?.stream?.isLive
    ? 'В эфире сейчас'
    : events?.stream?.countdown
      ? `До трансляции: ${events.stream.countdown}`
      : 'Не в эфире';

  const streamDescription = events?.stream?.isLive
    ? 'Подключайтесь к прямой трансляции'
    : 'Эфир начнется по времени ближайшего собрания';

  return (
    <>
      <div className="hidden grid-cols-3 gap-4 lg:grid">
        <FeedCard
          icon={LuPlay}
          title={events?.stream?.title || 'Эфир'}
          description={streamDescription}
          status={streamStatus}
          link={events?.stream?.link || '/broadcast'}
        />
        <FeedCard
          icon={LuVideo}
          title={events?.media?.title || 'Медиа'}
          description={events?.media?.description || 'Новые записи и подкасты'}
          status="Обновляется регулярно"
          link={events?.media?.link || '/resources/video'}
        />
        <FeedCard
          icon={LuCalendarDays}
          title={events?.event?.title || 'Событие'}
          description={events?.event?.description || 'Следите за расписанием'}
          status={events?.event?.when || 'Время уточняется'}
          link={events?.event?.link || '/events'}
        />
      </div>

      <div className="scrollbar-hide -mx-1 overflow-x-auto px-1 lg:hidden">
        <div className="flex w-max gap-3">
          <FeedCard
            icon={LuPlay}
            title={events?.stream?.title || 'Эфир'}
            description={streamDescription}
            status={streamStatus}
            link={events?.stream?.link || '/broadcast'}
          />
          <FeedCard
            icon={LuVideo}
            title={events?.media?.title || 'Медиа'}
            description={events?.media?.description || 'Новые записи и подкасты'}
            status="Обновляется регулярно"
            link={events?.media?.link || '/resources/video'}
          />
          <FeedCard
            icon={LuCalendarDays}
            title={events?.event?.title || 'Событие'}
            description={events?.event?.description || 'Следите за расписанием'}
            status={events?.event?.when || 'Время уточняется'}
            link={events?.event?.link || '/events'}
          />
        </div>
      </div>
    </>
  );
}
