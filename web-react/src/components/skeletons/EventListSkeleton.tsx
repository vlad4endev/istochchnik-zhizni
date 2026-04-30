import { SkeletonBox } from '@/components/ui/SkeletonBox';

export function EventListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-stone-200 bg-white p-3">
          <SkeletonBox height="15px" width={`${52 + ((i * 13) % 28)}%`} />
          <SkeletonBox className="mt-2" height="12px" width="35%" />
          <SkeletonBox className="mt-3" height="12px" width="100%" />
          <SkeletonBox className="mt-2" height="12px" width="90%" />
        </div>
      ))}
    </div>
  );
}
