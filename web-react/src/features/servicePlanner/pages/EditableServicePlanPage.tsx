import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LuLoaderCircle } from 'react-icons/lu';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { fetchEditableServicePlan } from '../api';

/**
 * Edit-ссылка: резолвит token и открывает обычный планировщик на конкретной программе.
 * В итоге пользователь видит тот же интерфейс 1:1, что и в ServicePlannerPage.
 */
export function EditableServicePlanPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const planQ = useQuery({
    queryKey: ['editable-service-plan', token, 'resolve'],
    queryFn: () => fetchEditableServicePlan(token ?? ''),
    enabled: Boolean(token && token.length > 20),
    retry: false,
  });

  useEffect(() => {
    if (!planQ.data) return;
    navigate('/service-planner', {
      replace: true,
      state: {
        sharedEditPlanId: planQ.data.plan.id,
        sharedEditToken: token ?? '',
      },
    });
  }, [navigate, planQ.data, token]);

  if (!token) return <Navigate to="/" replace />;
  if (planQ.isLoading || planQ.isFetching) {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center gap-2 text-stone-500">
        <LuLoaderCircle className="h-4 w-4 animate-spin" />
        Открываю программу...
      </div>
    );
  }
  if (planQ.isError || !planQ.data) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-red-600">
          Ссылка недействительна или редактирование недоступно. Для опубликованных программ доступен только просмотр по
          share-ссылке.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[30dvh] items-center justify-center text-stone-500">
      Переход в планировщик...
    </div>
  );
}
