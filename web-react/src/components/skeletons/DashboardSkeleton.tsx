import { SkeletonBox } from '@/components/ui/SkeletonBox';

export function DashboardSkeleton() {
  return (
    <div className="min-h-full bg-[var(--surface)] px-3 sm:px-4 shell:px-6 md:px-8 xl:px-10">
      <div className="mx-auto w-full max-w-7xl 2xl:max-w-[1480px] space-y-4" aria-busy="true" aria-label="Загрузка главной страницы">
        <div className="rounded-[22px] bg-[#6B2D3E] px-4 pb-6 pt-5 lg:px-7 lg:py-[22px]">
          <SkeletonBox width="120px" height="13px" className="opacity-70" />
          <SkeletonBox width="210px" height="26px" className="mt-2" />
          <SkeletonBox width="160px" height="12px" className="mt-2 opacity-70" />
        </div>

        <div className="hidden lg:grid lg:grid-cols-3 lg:gap-[14px]">
          <div className="rounded-[14px] border border-stone-200 bg-white p-4">
            <div className="flex items-start gap-3.5">
              <SkeletonBox width="52px" height="52px" radius="9999px" />
              <div className="min-w-0 flex-1">
                <SkeletonBox height="15px" width="60%" />
                <SkeletonBox className="mt-2" height="20px" width="45%" radius="9999px" />
                <SkeletonBox className="mt-2" height="12px" width="90%" />
              </div>
            </div>
          </div>
          <div className="rounded-[14px] border border-stone-200 bg-white p-4">
            <SkeletonBox height="12px" width="40%" />
            <div className="mt-3 flex items-start gap-3">
              <SkeletonBox width="42px" height="42px" radius="11px" />
              <div className="min-w-0 flex-1">
                <SkeletonBox height="14px" width="65%" />
                <SkeletonBox className="mt-2" height="12px" width="45%" />
              </div>
            </div>
          </div>
          <div className="rounded-[14px] border border-stone-200 bg-white p-4">
            <SkeletonBox height="12px" width="42%" />
            <div className="mt-3 flex items-start gap-3">
              <SkeletonBox width="42px" height="42px" radius="11px" />
              <div className="min-w-0 flex-1">
                <SkeletonBox height="14px" width="62%" />
                <SkeletonBox className="mt-2" height="12px" width="55%" />
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-grid grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 xl:grid-cols-12 lg:hidden">
          <div className="flex flex-col gap-3 xl:col-span-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <SkeletonBox height="12px" width="32%" />
              <div className="mt-3 flex items-start gap-3">
                <SkeletonBox width="56px" height="56px" radius="16px" />
                <div className="min-w-0 flex-1">
                  <SkeletonBox height="16px" width="58%" />
                  <SkeletonBox className="mt-2" height="12px" width="42%" />
                  <SkeletonBox className="mt-2" height="18px" width="34%" radius="9999px" />
                  <SkeletonBox className="mt-2" height="12px" width="88%" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:col-span-2 xl:col-span-8">
            <SkeletonBox height="12px" width="28%" />
            <div className="mt-4 flex items-start gap-3">
              <SkeletonBox width="48px" height="48px" radius="12px" />
              <div className="min-w-0 flex-1">
                <SkeletonBox height="15px" width="52%" />
                <SkeletonBox className="mt-2" height="13px" width="64%" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:col-span-2 xl:col-span-6">
            <div className="flex items-center justify-between gap-2">
              <SkeletonBox height="12px" width="22%" />
              <SkeletonBox height="30px" width="66px" radius="9px" />
            </div>
            <SkeletonBox className="mt-3" height="14px" width="86%" />
            <div className="mt-3 flex gap-2">
              <SkeletonBox height="40px" width="132px" radius="9px" />
              <SkeletonBox height="40px" width="132px" radius="9px" />
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:col-span-2 xl:col-span-6">
            <SkeletonBox height="12px" width="30%" />
            <div className="mt-3 flex items-start gap-3">
              <SkeletonBox width="42px" height="42px" radius="11px" />
              <div className="min-w-0 flex-1">
                <SkeletonBox height="14px" width="58%" />
                <SkeletonBox className="mt-2" height="12px" width="44%" />
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:grid lg:grid-cols-3 lg:gap-[14px]">
          <div className="col-span-2 rounded-[14px] border border-stone-200 bg-white p-4">
            <SkeletonBox height="12px" width="18%" />
            <SkeletonBox className="mt-3" height="13px" width="96%" />
            <SkeletonBox className="mt-2" height="13px" width="90%" />
            <SkeletonBox className="mt-2" height="13px" width="82%" />
          </div>
          <div className="rounded-[14px] border border-stone-200 bg-white p-4">
            <SkeletonBox height="12px" width="24%" />
            <SkeletonBox className="mt-3" height="14px" width="84%" />
            <div className="mt-3 flex gap-2">
              <SkeletonBox height="40px" width="132px" radius="9px" />
              <SkeletonBox height="40px" width="132px" radius="9px" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
