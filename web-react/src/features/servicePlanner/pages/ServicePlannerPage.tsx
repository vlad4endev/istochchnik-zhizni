import { Link } from 'react-router-dom';

export function ServicePlannerPage() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 md:px-6">
      <header className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">Планировщик служений</h1>
        <p className="mt-2 text-sm text-stone-600">
          Раздел подключен. Далее здесь будет управление шаблонами служений, планами и блоками.
        </p>
      </header>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Что уже сделано</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-stone-700">
          <li>Добавлена миграция БД для шаблонов, планов и блоков служения.</li>
          <li>Подготовлены структуры для `content_json`, ролей ведущего и проповедника, публичной ссылки.</li>
          <li>Включен отдельный маршрут и пункт меню для раздела.</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Временная навигация</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            to="/service-flow"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-primary hover:text-primary"
          >
            Открыть Service Flow
          </Link>
          <Link
            to="/songbook"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-primary hover:text-primary"
          >
            Перейти в песенник
          </Link>
        </div>
      </div>
    </section>
  );
}
