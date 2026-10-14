import { AppHeader } from '@/components/ui/AppHeader';

/** Единая шапка экрана — делегирует в AppHeader (Android mockup). */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <AppHeader title={title} subtitle={subtitle} className="app-page-header" />;
}
