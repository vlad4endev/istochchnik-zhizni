import { Capacitor } from '@capacitor/core';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';

const IS_ANDROID_NATIVE = typeof window !== 'undefined' && Capacitor.getPlatform() === 'android';

/**
 * Шапка экрана из макетов Android-приложения. В PWA и на iOS ничего не рисует:
 * там у страницы остаётся собственный заголовок (он скрыт в Android классом `app-native-hide`).
 */
export function NativeScreenHeader({ title }: { title: string }) {
  if (!IS_ANDROID_NATIVE) return null;
  return (
    <div className={sectionHeroStickyClass}>
      <PageHeader title={title} />
    </div>
  );
}
