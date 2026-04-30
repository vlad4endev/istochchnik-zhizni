import { SkeletonBox } from '@/components/ui/SkeletonBox';

export function PrayerSkeleton() {
  return (
    <div className="space-y-3 py-2" aria-busy="true" aria-live="polite" aria-label="Загрузка страницы молитвы">
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <SkeletonBox height="72px" radius="12px" />
      </div>

      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-3">
            <SkeletonBox width="44px" height="44px" radius="12px" />
            <SkeletonBox height="18px" width="52%" />
          </div>
          <SkeletonBox height="13px" width="100%" />
          <SkeletonBox className="mt-2" height="13px" width="88%" />
          <SkeletonBox className="mt-2" height="13px" width="72%" />
        </div>
      ))}

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <SkeletonBox width="48px" height="48px" radius="9999px" />
          <div className="min-w-0 flex-1">
            <SkeletonBox height="18px" width="45%" />
            <SkeletonBox className="mt-2" height="13px" width="84%" />
            <SkeletonBox className="mt-2" height="13px" width="70%" />
          </div>
        </div>
      </div>
    </div>
  );
}
