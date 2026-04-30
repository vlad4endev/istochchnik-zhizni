import { SkeletonBox } from '@/components/ui/SkeletonBox';

export function UserListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3">
          <SkeletonBox width="40px" height="40px" radius="999px" />
          <div className="flex-1">
            <SkeletonBox height="14px" width={`${50 + ((i * 11) % 25)}%`} />
            <SkeletonBox className="mt-2" height="11px" width="30%" />
          </div>
          <SkeletonBox width="60px" height="28px" radius="14px" />
        </div>
      ))}
    </div>
  );
}
