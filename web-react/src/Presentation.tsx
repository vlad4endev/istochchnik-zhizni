import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useInView } from 'framer-motion';
import {
  LuActivity,
  LuArrowLeft,
  LuArrowRight,
  LuChartLine,
  LuCheck,
  LuClock3,
  LuCode,
  LuContactRound,
  LuDatabase,
  LuGlobe,
  LuLayers,
  LuLayoutTemplate,
  LuLock,
  LuMonitor,
  LuMoveRight,
  LuRocket,
  LuServer,
  LuShieldAlert,
  LuSparkles,
  LuTriangleAlert,
  LuUsers,
  LuWrench,
} from 'react-icons/lu';
import type { IconType } from 'react-icons/lib';

type SlideDirection = 1 | -1;

type Slide = {
  id: string;
  title: string;
  kicker: string;
  notes: string;
  render: () => JSX.Element;
};

const TOTAL_SLIDES = 10;
const SWIPE_THRESHOLD = 56;

function MetricValue({
  target,
  suffix = '',
  shouldAnimate = false,
}: {
  target: number;
  suffix?: string;
  shouldAnimate?: boolean;
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!shouldAnimate) {
      setValue(0);
      return;
    }
    const controls = animate(0, target, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setValue(Math.round(latest)),
    });
    return () => controls.stop();
  }, [target, shouldAnimate]);

  return (
    <motion.span className="tabular-nums" aria-label={`${target}${suffix}`}>
      {value.toLocaleString('ru-RU')}
      {suffix}
    </motion.span>
  );
}

function TechBadge({ icon: Icon, title, caption }: { icon: IconType; title: string; caption: string }) {
  return (
    <article className="rounded-2xl border border-stone-200/70 bg-white/80 p-4 shadow-[var(--shadow-card)] backdrop-blur-sm">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <h4 className="mt-3 text-sm font-extrabold text-[var(--text)]">{title}</h4>
      <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">{caption}</p>
    </article>
  );
}

function FeatureCard({ icon: Icon, title, text }: { icon: IconType; title: string; text: string }) {
  return (
    <article className="group rounded-3xl border border-stone-200/70 bg-white/85 p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)]">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h4 className="mt-4 text-lg font-extrabold text-[var(--text)]">{title}</h4>
      <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--text-secondary)]">{text}</p>
    </article>
  );
}

function FeaturesSlide() {
  const items = [
    { icon: LuUsers, title: 'Умный профиль', text: 'Публикации, персонализация и единая учетная запись с ролями.' },
    { icon: LuGlobe, title: 'Медиа-центр', text: 'Подкасты, видео и эфиры в одном маршруте без потери контекста.' },
    { icon: LuWrench, title: 'Служебные сценарии', text: 'Координация циклов и задач с минимальными ручными операциями.' },
    { icon: LuLock, title: 'Безопасный доступ', text: 'Ролевая модель, проверка регистрации и устойчивые auth-потоки.' },
  ] as const;

  return (
    <motion.div
      className="grid h-full gap-4 rounded-3xl border border-stone-200/70 bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-card)] sm:grid-cols-2"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: 0.1 },
        },
      }}
    >
      {items.map((item) => (
        <motion.div
          key={item.title}
          variants={{
            hidden: { opacity: 0, y: 18 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } },
          }}
        >
          <FeatureCard icon={item.icon} title={item.title} text={item.text} />
        </motion.div>
      ))}
    </motion.div>
  );
}

function MetricsSlide() {
  const metricsRef = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(metricsRef, { once: true, amount: 0.5 });

  return (
    <div
      ref={metricsRef}
      className="grid h-full gap-4 rounded-3xl border border-primary/20 bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow)] sm:grid-cols-3"
    >
      <article className="rounded-3xl border border-stone-200/70 bg-white/90 p-5 shadow-[var(--shadow-card)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-stone-500">Активные пользователи</p>
        <p className="mt-4 text-5xl font-extrabold text-primary">
          <MetricValue target={1200} suffix="+" shouldAnimate={isInView} />
        </p>
        <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">
          Ежемесячная вовлеченность в ключевые сценарии.
        </p>
      </article>
      <article className="rounded-3xl border border-stone-200/70 bg-white/90 p-5 shadow-[var(--shadow-card)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-stone-500">Время в приложении</p>
        <p className="mt-4 text-5xl font-extrabold text-primary">
          <MetricValue target={18} suffix="m" shouldAnimate={isInView} />
        </p>
        <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">Средняя сессия на активного пользователя.</p>
      </article>
      <article className="rounded-3xl border border-stone-200/70 bg-white/90 p-5 shadow-[var(--shadow-card)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-stone-500">Конверсия действий</p>
        <p className="mt-4 text-5xl font-extrabold text-primary">
          <MetricValue target={67} suffix="%" shouldAnimate={isInView} />
        </p>
        <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">
          Доля пользователей, завершающих целевой сценарий.
        </p>
      </article>
    </div>
  );
}

export function Presentation() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<SlideDirection>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [presenterMode, setPresenterMode] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);

  const goToSlide = useCallback((next: number) => {
    setDirection(next > index ? 1 : -1);
    setIndex(next);
  }, [index]);

  const goNext = useCallback(() => {
    setDirection(1);
    setIndex((prev) => Math.min(prev + 1, TOTAL_SLIDES - 1));
  }, []);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      return;
    }
    await document.exitFullscreen();
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        void toggleFullscreen();
      }
      if (event.key === 'Escape' && document.fullscreenElement) {
        event.preventDefault();
        void document.exitFullscreen();
      }
      if (
        event.key.toLowerCase() === 'p' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setPresenterMode((prev) => !prev);
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [goNext, goPrev, toggleFullscreen]);

  const progress = ((index + 1) / TOTAL_SLIDES) * 100;

  const slides = useMemo<Slide[]>(
    () => [
      {
        id: 'hero',
        kicker: 'Презентация проекта',
        title: 'Источник Жизни',
        notes: 'Открываем презентацию через миссию продукта и эмоциональный образ единой платформы.',
        render: () => (
          <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-3xl border border-primary/25 bg-[var(--surface-elevated)] p-8 shadow-[var(--shadow)] sm:p-10">
            <div className="pointer-events-none absolute inset-0 opacity-80">
              <div className="presentation-mesh-blob presentation-mesh-blob--1" />
              <div className="presentation-mesh-blob presentation-mesh-blob--2" />
              <div className="presentation-mesh-blob presentation-mesh-blob--3" />
            </div>
            <div className="relative max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary/90">{'01 / HERO'}</p>
              <h1 className="mt-5 text-5xl font-extrabold tracking-tight text-[var(--text)] sm:text-6xl lg:text-7xl">
                Источник Жизни
              </h1>
              <p className="mt-5 max-w-2xl text-xl font-semibold leading-relaxed text-[var(--text-secondary)]">
                Цифровая экосистема для общины: молитва, расписание, медиа и коммуникация в одном современном
                пространстве.
              </p>
              <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-white/70 px-4 py-2 text-sm font-bold text-primary shadow-[var(--shadow-card)] backdrop-blur-sm">
                <LuSparkles className="h-4 w-4" aria-hidden />
                <span>Единый опыт на web + mobile shell</span>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'problem',
        kicker: 'Почему это важно',
        title: 'Проблема',
        notes: 'Фиксируем 3 ключевые боли: фрагментация, ручная координация, слабая вовлеченность.',
        render: () => (
          <div className="grid h-full gap-4 rounded-3xl border border-stone-200/70 bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-card)] sm:grid-cols-3 sm:p-8">
            {[
              {
                icon: LuTriangleAlert,
                title: 'Разрозненные каналы',
                text: 'Информация о событиях и молитвенных нуждах теряется между чатами и таблицами.',
              },
              {
                icon: LuClock3,
                title: 'Ручные процессы',
                text: 'Координация служений и еженедельных циклов требует множества повторяющихся действий.',
              },
              {
                icon: LuShieldAlert,
                title: 'Слабая вовлеченность',
                text: 'Пользователи не получают целостный персональный путь: профиль, медиа, участие, обратная связь.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <article
                key={title}
                className="rounded-3xl border border-stone-200/70 bg-white/85 p-5 shadow-[var(--shadow-card)] backdrop-blur-sm"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="mt-4 text-xl font-extrabold text-[var(--text)]">{title}</h3>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--text-secondary)]">{text}</p>
              </article>
            ))}
          </div>
        ),
      },
      {
        id: 'solution',
        kicker: 'Наш подход',
        title: 'Решение',
        notes: 'Показываем, что решение объединяет процессы и сохраняет единый UX-язык.',
        render: () => (
          <div className="grid h-full gap-6 rounded-3xl border border-primary/20 bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow)] lg:grid-cols-[1.1fr_1fr] lg:p-8">
            <div className="flex flex-col justify-center">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary/90">Единая платформа</p>
              <h3 className="mt-3 text-4xl font-extrabold leading-tight text-[var(--text)] sm:text-5xl">
                От контента до действий в одном интерфейсе
              </h3>
              <p className="mt-4 max-w-xl text-lg font-semibold leading-relaxed text-[var(--text-secondary)]">
                Проект объединяет ежедневную молитву, расписание, трансляции, публикации и коммуникацию, сохраняя
                знакомый визуальный язык и доступность на всех устройствах.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-[var(--text-on-primary)] shadow-sm shadow-primary/20">
                <LuRocket className="h-4 w-4" aria-hidden />
                <span>Быстрый рост без потери качества UX</span>
              </div>
            </div>
            <div className="rounded-3xl border border-stone-200/70 bg-white/90 p-4 shadow-[var(--shadow-card)]">
              <div className="rounded-2xl border border-stone-200 bg-stone-100 p-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                </div>
                <div className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-[var(--surface)] p-3">
                  <div className="h-2 w-2/5 rounded-full bg-primary/25" />
                  <div className="mt-2 h-2 w-4/5 rounded-full bg-stone-200" />
                  <div className="mt-1.5 h-2 w-3/5 rounded-full bg-stone-200" />
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-stone-200 bg-white p-2">
                      <div className="h-12 rounded-lg bg-primary/10" />
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-white p-2">
                      <div className="h-12 rounded-lg bg-[var(--accent)]/10" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'stack',
        kicker: 'Инженерная база',
        title: 'Tech Stack',
        notes: 'Обосновываем стек как баланс скорости разработки, надежности и масштабируемости.',
        render: () => (
          <div className="grid h-full gap-4 rounded-3xl border border-stone-200/70 bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-card)] sm:grid-cols-2 lg:grid-cols-3">
            <TechBadge icon={LuLayoutTemplate} title="React + TypeScript" caption="Типобезопасный UI и предсказуемая архитектура." />
            <TechBadge icon={LuLayers} title="Tailwind CSS" caption="Дизайн через существующие utility и токены проекта." />
            <TechBadge icon={LuActivity} title="Framer Motion" caption="Мягкие анимации с учетом производительности." />
            <TechBadge icon={LuDatabase} title="Supabase + Postgres" caption="Данные, авторизация и реалтайм-сценарии." />
            <TechBadge icon={LuServer} title="Express API" caption="Серверная бизнес-логика и интеграции." />
            <TechBadge icon={LuCode} title="Vite + PWA" caption="Быстрый dev-поток и мобильная оболочка." />
          </div>
        ),
      },
      {
        id: 'architecture',
        kicker: 'Системный взгляд',
        title: 'Архитектура',
        notes: 'Подчеркиваем поток ценности: клиентские интерфейсы -> сервисы -> данные.',
        render: () => (
          <div className="h-full rounded-3xl border border-stone-200/70 bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow)]">
            <div className="grid h-full items-center gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <div className="rounded-3xl border border-stone-200/70 bg-white/90 p-4 shadow-[var(--shadow-card)]">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-stone-500">Client</p>
                <p className="mt-2 text-2xl font-extrabold text-[var(--text)]">Web / Mobile</p>
                <p className="mt-2 text-sm font-medium text-[var(--text-secondary)]">
                  React UI, роутинг, состояния, доступность.
                </p>
              </div>
              <LuMoveRight className="mx-auto h-8 w-8 text-primary lg:h-10 lg:w-10" />
              <div className="rounded-3xl border border-primary/30 bg-primary/[0.05] p-4 shadow-[var(--shadow-card)]">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Application Layer</p>
                <p className="mt-2 text-2xl font-extrabold text-[var(--text)]">API + Services</p>
                <p className="mt-2 text-sm font-medium text-[var(--text-secondary)]">
                  Правила доступа, расписание, медиа, коммуникация.
                </p>
              </div>
              <LuMoveRight className="mx-auto h-8 w-8 text-primary lg:h-10 lg:w-10" />
              <div className="rounded-3xl border border-stone-200/70 bg-white/90 p-4 shadow-[var(--shadow-card)]">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-stone-500">Data</p>
                <p className="mt-2 text-2xl font-extrabold text-[var(--text)]">Postgres / Realtime</p>
                <p className="mt-2 text-sm font-medium text-[var(--text-secondary)]">
                  Надежное хранение, синхронизация и масштабируемость.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'features',
        kicker: 'Что получает пользователь',
        title: 'Ключевые функции',
        notes: 'Акцент на пользовательской ценности: персонализация, медиа, процессы и безопасность.',
        render: () => <FeaturesSlide />,
      },
      {
        id: 'demo',
        kicker: 'Визуальный walkthrough',
        title: 'Demo',
        notes: 'Проходим сценарий глазами пользователя: главная -> молитва -> медиа.',
        render: () => (
          <div className="grid h-full gap-4 rounded-3xl border border-stone-200/70 bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-card)] lg:grid-cols-3">
            {['Dashboard', 'Prayer', 'Media'].map((screen, idx) => (
              <article key={screen} className="rounded-3xl border border-stone-200/70 bg-white/90 p-3 shadow-[var(--shadow-card)]">
                <div className="rounded-2xl border border-stone-200 bg-stone-100 p-2">
                  <div className="flex items-center justify-between text-[10px] font-bold text-stone-500">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-red-300" />
                      <span className="h-2 w-2 rounded-full bg-amber-300" />
                      <span className="h-2 w-2 rounded-full bg-emerald-300" />
                    </span>
                    <span>{screen.toLowerCase()}.church.app</span>
                  </div>
                  <div className="mt-2 overflow-hidden rounded-xl border border-stone-200 bg-[var(--surface)] p-2">
                    <div className={`h-24 rounded-lg ${idx % 2 === 0 ? 'bg-primary/10' : 'bg-[var(--accent)]/10'}`} />
                    <div className="mt-2 space-y-1.5">
                      <div className="h-2 w-5/6 rounded-full bg-stone-200" />
                      <div className="h-2 w-4/6 rounded-full bg-stone-200" />
                      <div className="h-2 w-3/6 rounded-full bg-stone-200" />
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-sm font-extrabold text-[var(--text)]">{screen}</p>
                <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">Ключевой сценарий для ежедневного использования.</p>
              </article>
            ))}
          </div>
        ),
      },
      {
        id: 'metrics',
        kicker: 'Результаты и потенциал',
        title: 'Метрики',
        notes: 'Показываем динамику продукта на трех цифрах: аудитория, вовлеченность, конверсия.',
        render: () => <MetricsSlide />,
      },
      {
        id: 'roadmap',
        kicker: 'План развития',
        title: 'Roadmap',
        notes: 'Фокус на последовательности: что уже есть, что делаем сейчас, куда идем дальше.',
        render: () => (
          <div className="h-full rounded-3xl border border-stone-200/70 bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-card)]">
            <div className="relative grid gap-4 lg:grid-cols-3">
              {[
                { period: 'Прошлое', title: 'MVP и запуск', text: 'Базовые сценарии, инфраструктура и PWA.', state: 'done' },
                { period: 'Настоящее', title: 'Рост и оптимизация', text: 'Улучшение UX, доступности и контентного ядра.', state: 'now' },
                { period: 'Будущее', title: 'AI и автоматизация', text: 'Умные рекомендации и расширенные рабочие потоки.', state: 'next' },
              ].map((item, idx) => (
                <article key={item.period} className="relative rounded-3xl border border-stone-200/70 bg-white/90 p-5 shadow-[var(--shadow-card)]">
                  {idx < 2 ? (
                    <div className="absolute right-[-0.9rem] top-1/2 hidden h-0.5 w-7 -translate-y-1/2 bg-primary/40 lg:block" />
                  ) : null}
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-stone-500">{item.period}</p>
                  <h4 className="mt-2 text-2xl font-extrabold text-[var(--text)]">{item.title}</h4>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--text-secondary)]">{item.text}</p>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                    {item.state === 'done' ? <LuCheck className="h-4 w-4" aria-hidden /> : null}
                    {item.state === 'now' ? <LuChartLine className="h-4 w-4" aria-hidden /> : null}
                    {item.state === 'next' ? <LuRocket className="h-4 w-4" aria-hidden /> : null}
                    <span>{item.state === 'done' ? 'Завершено' : item.state === 'now' ? 'В работе' : 'Далее'}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ),
      },
      {
        id: 'contacts',
        kicker: 'Финал',
        title: 'Контакты',
        notes: 'Закрываем презентацию четким CTA и переходом к обсуждению следующего шага.',
        render: () => (
          <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-3xl border border-primary/25 bg-[var(--surface-elevated)] p-8 shadow-[var(--shadow)] sm:p-10">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
            <div className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-[var(--accent)]/15 blur-3xl" />
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary/90">Спасибо за внимание</p>
            <h2 className="mt-4 text-5xl font-extrabold tracking-tight text-[var(--text)] sm:text-6xl">Готовы к следующему шагу</h2>
            <p className="mt-4 max-w-2xl text-lg font-semibold leading-relaxed text-[var(--text-secondary)]">
              Обсудим внедрение, масштабирование и приоритеты следующего релиза.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <a
                href="mailto:team@church.app"
                className="inline-flex items-center gap-2 rounded-2xl border border-primary/30 bg-white/75 px-4 py-3 text-sm font-extrabold text-primary shadow-[var(--shadow-card)] backdrop-blur-sm"
              >
                <LuContactRound className="h-5 w-5" aria-hidden />
                team@church.app
              </a>
              <a
                href="https://church.app"
                className="inline-flex items-center gap-2 rounded-2xl border border-stone-200/80 bg-white/75 px-4 py-3 text-sm font-extrabold text-[var(--text)] shadow-[var(--shadow-card)] backdrop-blur-sm"
              >
                <LuMonitor className="h-5 w-5 text-primary" aria-hidden />
                church.app
              </a>
            </div>
            <div className="mt-5 inline-flex w-fit items-center gap-2 rounded-xl border border-stone-200/80 bg-white/80 px-3 py-2 text-xs font-bold text-stone-700 shadow-[var(--shadow-card)] backdrop-blur-sm">
              <span className="text-primary">Tip:</span>
              <span>Press Cmd+P → Save as PDF</span>
            </div>
          </div>
        ),
      },
    ],
    [],
  );

  const current = slides[index];

  return (
    <div
      ref={containerRef}
      className="relative min-h-screen w-full overflow-hidden bg-[var(--surface)] text-[var(--text)]"
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchMove={(event) => {
        if (touchStartX.current == null) return;
        const delta = event.touches[0].clientX - touchStartX.current;
        if (Math.abs(delta) < SWIPE_THRESHOLD) return;
        if (delta < 0) goNext();
        if (delta > 0) goPrev();
        touchStartX.current = null;
      }}
      onTouchEnd={() => {
        touchStartX.current = null;
      }}
    >
      <div className="absolute left-0 top-0 z-50 h-1.5 w-full bg-stone-200/70">
        <motion.div className="h-full bg-primary" animate={{ width: `${progress}%` }} transition={{ duration: 0.32 }} />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col px-4 pb-7 pt-8 sm:px-6">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-stone-500">{current.kicker}</p>
            <h2 className="text-2xl font-extrabold tracking-tight text-[var(--text)] sm:text-3xl">{current.title}</h2>
          </div>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-xs font-extrabold text-stone-700 shadow-[var(--shadow-card)] hover:bg-stone-50"
          >
            <LuMonitor className="h-4 w-4 text-primary" aria-hidden />
            {isFullscreen ? 'Выйти (Esc)' : 'Fullscreen (F)'}
          </button>
        </header>

        <main className="relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence custom={direction} initial={false} mode="wait">
            <motion.section
              key={current.id}
              custom={direction}
              initial={{ opacity: 0, x: direction === 1 ? 56 : -56 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction === 1 ? -56 : 56 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0"
            >
              {current.render()}
            </motion.section>
          </AnimatePresence>
        </main>

        {presenterMode ? (
          <aside className="mt-3 rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-card)]">
            <span className="mr-2 inline-flex rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--text-on-primary)]">
              Presenter Notes
            </span>
            {current.notes}
          </aside>
        ) : null}

        <footer className="mt-4 flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-stone-200/80 bg-white/85 px-3 py-1.5 text-xs font-bold text-stone-600 shadow-[var(--shadow-card)]">
            <LuMoveRight className="h-4 w-4 text-primary" aria-hidden />
            <span>Arrow keys + swipe</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={index === 0}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 text-sm font-extrabold text-stone-700 shadow-[var(--shadow-card)] disabled:opacity-45"
            >
              <LuArrowLeft className="h-4 w-4" aria-hidden />
              Назад
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={index === TOTAL_SLIDES - 1}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-primary px-3 text-sm font-extrabold text-[var(--text-on-primary)] shadow-sm shadow-primary/20 disabled:opacity-45"
            >
              Далее
              <LuArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </footer>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/85 px-3 py-1.5 text-xs font-extrabold text-stone-700 shadow-[var(--shadow-card)]">
        {String(index + 1).padStart(2, '0')} / {TOTAL_SLIDES}
      </div>

      <nav className="pointer-events-auto absolute bottom-4 left-1/2 z-20 hidden -translate-x-1/2 gap-1.5 rounded-full border border-stone-200/70 bg-white/85 px-2 py-1 shadow-[var(--shadow-card)] sm:inline-flex">
        {slides.map((slide, slideIndex) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Слайд ${slideIndex + 1}`}
            onClick={() => goToSlide(slideIndex)}
            className={`h-2.5 w-2.5 rounded-full transition ${
              slideIndex === index ? 'bg-primary' : 'bg-stone-300 hover:bg-stone-400'
            }`}
          />
        ))}
      </nav>

      <style>{`
        @keyframes presentation-mesh-drift {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(4%, -3%, 0) scale(1.08);
          }
          100% {
            transform: translate3d(-3%, 4%, 0) scale(0.98);
          }
        }

        .presentation-mesh-blob {
          position: absolute;
          border-radius: 9999px;
          filter: blur(56px);
          mix-blend-mode: multiply;
          animation: presentation-mesh-drift 12s ease-in-out infinite alternate;
        }

        .presentation-mesh-blob--1 {
          width: 24rem;
          height: 24rem;
          top: -6rem;
          left: -5rem;
          background: color-mix(in srgb, var(--primary) 28%, transparent);
        }

        .presentation-mesh-blob--2 {
          width: 26rem;
          height: 26rem;
          right: -6rem;
          top: 14%;
          background: color-mix(in srgb, var(--accent) 24%, transparent);
          animation-delay: 0.7s;
        }

        .presentation-mesh-blob--3 {
          width: 22rem;
          height: 22rem;
          left: 32%;
          bottom: -7rem;
          background: color-mix(in srgb, var(--primary-dark) 24%, transparent);
          animation-delay: 1.4s;
        }
      `}</style>
    </div>
  );
}

export default Presentation;
