import { useQuery } from '@tanstack/react-query';

import { fetchPublicSiteSettings } from './api';
import { SiteShell } from './components/SiteShell';

export function PublicSiteLayout() {
  const settingsQ = useQuery({
    queryKey: ['public-site', 'settings'],
    queryFn: fetchPublicSiteSettings,
    staleTime: 60_000,
  });

  return <SiteShell settings={settingsQ.data} />;
}
