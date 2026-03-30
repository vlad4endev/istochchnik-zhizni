/**
 * Латинский крест (протестантский тип): длинная вертикаль, короткая перекладина в верхней трети.
 * Не равноконечный «плюс».
 */
export function LatinCrossIcon({
  className,
  title,
  'aria-hidden': ariaHidden,
}: {
  className?: string;
  title?: string;
  'aria-hidden'?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-hidden={ariaHidden ?? !title}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <g fill="none" stroke="currentColor" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round">
        <line x1="256" y1="92" x2="256" y2="420" />
        <line x1="132" y1="208" x2="380" y2="208" />
      </g>
    </svg>
  );
}
