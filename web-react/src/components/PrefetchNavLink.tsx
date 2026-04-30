import { useQueryClient } from '@tanstack/react-query';
import { NavLink, type NavLinkProps } from 'react-router-dom';

type PrefetchNavLinkProps = NavLinkProps & {
  queryKey?: readonly unknown[];
  queryFn?: () => Promise<unknown>;
  staleTime?: number;
};

export function PrefetchNavLink({
  queryKey,
  queryFn,
  staleTime = 30_000,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: PrefetchNavLinkProps) {
  const queryClient = useQueryClient();

  const prefetch = () => {
    if (!queryKey || !queryFn) return;
    void queryClient.prefetchQuery({ queryKey, queryFn, staleTime });
  };

  return (
    <NavLink
      {...props}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        prefetch();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        prefetch();
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        prefetch();
      }}
    />
  );
}
