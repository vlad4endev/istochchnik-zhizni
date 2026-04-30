type SkeletonBoxProps = {
  width?: string;
  height?: string;
  radius?: string;
  className?: string;
};

export function SkeletonBox({
  width = '100%',
  height = '16px',
  radius = '8px',
  className = '',
}: SkeletonBoxProps) {
  return (
    <div
      className={`skeleton-box ${className}`.trim()}
      style={{ width, height, borderRadius: radius }}
      aria-hidden
    />
  );
}
