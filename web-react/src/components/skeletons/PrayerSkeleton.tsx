import { SkeletonBox } from '@/components/ui/SkeletonBox';

export function PrayerSkeleton() {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex gap-3">
            <SkeletonBox width="44px" height="44px" radius="12px" />
            <div className="flex-1">
              <SkeletonBox height="18px" width="65%" />
              <SkeletonBox className="mt-2" height="12px" width="95%" />
              <SkeletonBox className="mt-2" height="12px" width="80%" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
