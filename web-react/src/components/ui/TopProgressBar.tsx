import { useLoadingStore } from '@/stores/loadingStore';

export function TopProgressBar() {
  const isLoading = useLoadingStore((s) => s.isLoading);
  return (
    <div
      aria-hidden
      className={[
        'pointer-events-none fixed left-0 top-0 z-[9999] h-[3px] bg-[#D64035] transition-all duration-300 ease-out',
        isLoading ? 'w-[72%] opacity-100' : 'w-full opacity-0',
      ].join(' ')}
    />
  );
}
