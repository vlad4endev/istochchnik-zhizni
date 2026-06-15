import type { ReactNode } from 'react';
import { useImpersonation } from '../../admin/hooks/useImpersonation';

export function ImpersonationChatBlocked({ children }: { children: ReactNode }) {
  const { isImpersonating } = useImpersonation();

  if (isImpersonating) {
    return (
      <div className="flex h-64 items-center justify-center text-center">
        <div>
          <p className="mb-2 text-lg font-semibold">Раздел недоступен</p>
          <p className="text-sm text-gray-500">Чаты скрыты в режиме просмотра аккаунта</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
