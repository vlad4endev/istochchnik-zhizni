import { useQuery } from '@tanstack/react-query';

import { fetchMe } from '@/features/profile/api';
import { keys } from '@/lib/queryKeys';

export function useMe(enabled = true) {
  return useQuery({
    queryKey: keys.me,
    queryFn: fetchMe,
    enabled,
    staleTime: 5 * 60_000,
  });
}

