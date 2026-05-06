/**
 * @param {{ status: import('../store/chatStore').ChatMessage['status'], className?: string }} props
 */
export function MessageStatusIcon({ status, className = '' }) {
  const base = `inline-flex shrink-0 items-center ${className}`;

  if (status === 'sending') {
    return (
      <span className={base} aria-hidden>
        <svg
          className="h-3.5 w-3.5 animate-spin text-gray-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span className={`${base} text-sm font-bold text-red-500`} aria-hidden>
        ×
      </span>
    );
  }

  const checkClass =
    status === 'read' ? 'text-[#00BF6D]' : 'text-gray-400 dark:text-gray-500';

  if (status === 'sent') {
    return (
      <span className={`${base} ${checkClass} text-xs`} aria-hidden>
        ✓
      </span>
    );
  }

  return (
    <span className={`${base} ${checkClass} text-xs`} aria-hidden>
      ✓✓
    </span>
  );
}
