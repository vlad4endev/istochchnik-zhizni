import { SkeletonBox } from '@/components/ui/SkeletonBox';

export function SongListSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-stone-100 px-3 py-3 last:border-b-0">
          <SkeletonBox width="24px" height="12px" />
          <div className="flex-1">
            <SkeletonBox height="16px" width={`${60 + ((i * 7) % 30)}%`} />
            <SkeletonBox className="mt-2" height="12px" width="40%" />
          </div>
          <SkeletonBox width="30px" height="22px" radius="999px" />
        </div>
      ))}
    </div>
  );
}
