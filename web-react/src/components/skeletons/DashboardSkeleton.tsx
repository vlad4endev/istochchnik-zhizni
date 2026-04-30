import { SkeletonBox } from '@/components/ui/SkeletonBox';

export function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <SkeletonBox width="160px" height="28px" />
        <SkeletonBox width="96px" height="14px" className="mt-2" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SkeletonBox height="90px" />
        <SkeletonBox height="90px" />
        <SkeletonBox height="90px" />
      </div>
      <SkeletonBox height="120px" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SkeletonBox height="84px" />
        <SkeletonBox height="200px" />
      </div>
    </div>
  );
}
