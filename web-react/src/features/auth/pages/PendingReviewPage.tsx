import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../authStore';

/** Для split-деплоя (main/studio), где нет «Главной» как в монолите. */
export function PendingReviewPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-lg flex-col justify-center gap-4 px-4 py-12 text-center text-stone-700">
      <h1 className="text-xl font-semibold text-stone-900">Заявка на рассмотрении</h1>
      <p className="text-sm leading-relaxed">
        После подтверждения администратором откроется полный доступ. Затем обновите страницу или войдите снова.
      </p>
      <p className="flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          className="text-sm font-semibold text-primary underline"
          onClick={() => window.location.reload()}
        >
          Обновить страницу
        </button>
        <button
          type="button"
          className="text-sm font-medium text-stone-500 underline"
          onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
        >
          Выйти
        </button>
      </p>
    </div>
  );
}
