import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

import { apiClient } from '../../../lib/apiClient';
import { isAppAdministratorSession, useAuthStore } from '../../auth/authStore';

export type ImpersonationStatus = {
  isImpersonating: boolean;
  realAdminId?: number;
  targetMember?: { id: number; name: string };
};

const Q_IMPERSONATION_STATUS = ['admin', 'impersonation', 'status'] as const;

async function fetchImpersonationStatus(): Promise<ImpersonationStatus> {
  const { data } = await apiClient.get<ImpersonationStatus>('/api/admin/impersonate/status');
  return data;
}

export function useImpersonation() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const token = useAuthStore((s) => s.token);

  const statusQuery = useQuery({
    queryKey: Q_IMPERSONATION_STATUS,
    queryFn: fetchImpersonationStatus,
    staleTime: 30_000,
    retry: 1,
    enabled: Boolean(token),
  });

  const isImpersonating = statusQuery.data?.isImpersonating === true;
  const realAdminId = statusQuery.data?.realAdminId;
  const targetMember = statusQuery.data?.targetMember;

  const startImpersonation = useCallback(async (memberId: number) => {
    setActionError(null);
    try {
      await apiClient.post(`/api/admin/impersonate/${memberId}`);
      window.location.href = '/';
    } catch (e) {
      const msg = axios.isAxiosError(e)
        ? String((e.response?.data as { error?: string } | undefined)?.error ?? e.message)
        : 'Не удалось войти в аккаунт';
      setActionError(msg);
      throw e;
    }
  }, []);

  const exitImpersonation = useCallback(async () => {
    setActionError(null);
    try {
      await apiClient.post('/api/admin/impersonate/exit');
      await queryClient.invalidateQueries({ queryKey: Q_IMPERSONATION_STATUS });
      window.location.href = '/admin';
    } catch (e) {
      const msg = axios.isAxiosError(e)
        ? String((e.response?.data as { error?: string } | undefined)?.error ?? e.message)
        : 'Не удалось выйти из аккаунта';
      setActionError(msg);
      throw e;
    }
  }, [queryClient]);

  return {
    isImpersonating,
    realAdminId,
    targetMember,
    startImpersonation,
    exitImpersonation,
    actionError,
    isLoading: statusQuery.isLoading,
    canStartImpersonation: isAppAdministratorSession() && !isImpersonating,
  };
}

export function useImpersonationBodyOffset(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.paddingTop;
    document.body.style.paddingTop = '40px';
    return () => {
      document.body.style.paddingTop = prev;
    };
  }, [active]);
}
