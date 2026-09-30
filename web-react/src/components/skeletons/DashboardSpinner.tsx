import './DashboardSpinner.css';

/** Экран загрузки главной: градиентное кольцо с каплей («Источник жизни»). */
export function DashboardSpinner() {
  return (
    <div className="dash-spinner" role="status" aria-live="polite" aria-label="Загрузка главной страницы">
      <div className="dash-spinner__orb" aria-hidden>
        <span className="dash-spinner__ring" />
        <span className="dash-spinner__ring dash-spinner__ring--inner" />
        <svg className="dash-spinner__drop" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.5c-.4 0-.8.2-1 .5C8.4 6.3 5.5 10 5.5 14a6.5 6.5 0 0 0 13 0c0-4-2.9-7.7-5.5-11-.2-.3-.6-.5-1-.5Z" />
        </svg>
      </div>
      <p className="dash-spinner__label">
        Загружаем главную
        <span className="dash-spinner__dots" aria-hidden>
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </p>
    </div>
  );
}
