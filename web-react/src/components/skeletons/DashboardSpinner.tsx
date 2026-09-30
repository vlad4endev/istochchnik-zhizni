import './DashboardSpinner.css';

/** Экран загрузки главной: кольцо с градиентом в цветах приложения. */
export function DashboardSpinner() {
  return (
    <div className="dash-spinner" role="status" aria-live="polite" aria-label="Загрузка главной страницы">
      <span className="dash-spinner__loader" aria-hidden />
      <p className="dash-spinner__label">Загружаем главную</p>
    </div>
  );
}
