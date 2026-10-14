import { Link } from 'react-router-dom';
import { LuWifiOff } from 'react-icons/lu';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppLeaf } from '@/components/ui/AppLeaf';

export function OfflinePage() {
  return (
    <div className="flex min-h-[var(--app-content-height,100dvh)] flex-col bg-header">
      <AppHeader title="Офлайн" subtitle="Нет подключения к сети" />
      <AppLeaf className="flex flex-1 flex-col items-center justify-center px-4 pb-10">
        <AppCard className="mx-auto w-full max-w-sm text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-card bg-wine/10 text-wine">
            <LuWifiOff className="h-7 w-7" strokeWidth={2} aria-hidden />
          </div>
          <h2 className="mt-4 font-ui text-xl font-extrabold text-ink">Нет подключения</h2>
          <p className="mt-2 font-ui text-sm leading-relaxed text-muted">
            Проверьте интернет и попробуйте снова. Уже загруженные разделы могут быть доступны офлайн.
          </p>
          <Link to="/" className="mt-6 block">
            <AppButton fullWidth>На главную</AppButton>
          </Link>
        </AppCard>
      </AppLeaf>
    </div>
  );
}
