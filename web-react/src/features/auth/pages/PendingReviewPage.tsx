import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../authStore';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppLeaf } from '@/components/ui/AppLeaf';

/** Для split-деплоя (main/studio), где нет «Главной» как в монолите. */
export function PendingReviewPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex min-h-[var(--app-content-height,100dvh)] flex-col bg-header">
      <AppHeader title="Заявка" subtitle="Ожидает подтверждения администратора" />
      <AppLeaf className="flex flex-1 flex-col px-4 pb-8 pt-6">
        <AppCard className="mx-auto w-full max-w-lg text-center">
          <h2 className="font-ui text-xl font-extrabold text-ink">Заявка на рассмотрении</h2>
          <p className="mt-3 font-ui text-sm leading-relaxed text-muted">
            После подтверждения администратором откроется полный доступ. Затем обновите страницу или войдите
            снова.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <AppButton fullWidth onClick={() => window.location.reload()}>
              Обновить страницу
            </AppButton>
            <AppButton
              variant="ghost"
              fullWidth
              onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
            >
              Выйти
            </AppButton>
          </div>
        </AppCard>
      </AppLeaf>
    </div>
  );
}
