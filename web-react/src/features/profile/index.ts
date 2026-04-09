/**
 * Реэкспорт страниц (удобно для тестов/сторибука).
 * В роутере — ленивые импорты напрямую на `pages/ProfilePage` и `pages/PublicProfilePage`, чтобы были разные чанки.
 */
export { ProfilePage } from './pages/ProfilePage';
export { PublicProfilePage } from './pages/PublicProfilePage';
