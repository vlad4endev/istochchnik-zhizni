import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LuArrowRight, LuX } from 'react-icons/lu';

/** Split meeting title like the Glass mock: first word + italic accent line. */
export function splitGlassTitle(title: string): { head: string; accent: string } {
  const trimmed = title.trim();
  if (!trimmed) return { head: '', accent: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { head: trimmed, accent: '' };
  return { head: parts[0]!, accent: parts.slice(1).join(' ') };
}

export function GlassCallTitle({ title }: { title: string }) {
  const { head, accent } = splitGlassTitle(title);
  return (
    <h1 className="glass-call__title">
      <span className="glass-call__title-head">{head}</span>
      {accent ? <span className="glass-call__title-accent">{accent}</span> : null}
    </h1>
  );
}

export function GlassCallShell({
  children,
  className,
  onClose,
  closeTo = '/messenger',
  brand = 'Источник жизни · Встречи',
}: {
  children: ReactNode;
  className?: string;
  onClose?: () => void;
  closeTo?: string;
  brand?: string;
}) {
  return (
    <div className={['glass-call', className].filter(Boolean).join(' ')} role="main">
      <div className="glass-call__blobs" aria-hidden>
        <span className="glass-call__blob glass-call__blob--a" />
        <span className="glass-call__blob glass-call__blob--b" />
        <span className="glass-call__blob glass-call__blob--c" />
      </div>
      <svg className="glass-call__grain" aria-hidden>
        <filter id="glass-call-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#glass-call-grain)" />
      </svg>

      <div className="glass-call__inner">
        <header className="glass-call__topbar">
          <div className="glass-call__brand">
            <span className="glass-call__live-dot" aria-hidden />
            {brand}
          </div>
          {onClose ? (
            <button
              type="button"
              className="glass-call__close"
              aria-label="Закрыть"
              onClick={onClose}
            >
              <LuX size={20} strokeWidth={1.8} aria-hidden />
            </button>
          ) : (
            <Link to={closeTo} className="glass-call__close" aria-label="Закрыть">
              <LuX size={20} strokeWidth={1.8} aria-hidden />
            </Link>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

export function GlassCallCta({
  children,
  onClick,
  disabled,
  to,
  icon,
  variant = 'primary',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  to?: string;
  icon?: ReactNode;
  variant?: 'primary' | 'ghost';
}) {
  const className = [
    'glass-call__cta',
    variant === 'ghost' ? 'glass-call__cta--ghost' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <span className="glass-call__cta-label">
        {icon}
        {children}
      </span>
      {variant === 'primary' ? (
        <span className="glass-call__cta-arrow" aria-hidden>
          <LuArrowRight size={20} strokeWidth={2} />
        </span>
      ) : null}
    </>
  );

  if (to && !disabled) {
    return (
      <Link to={to} className={className} onClick={onClick}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      {body}
    </button>
  );
}

export type GlassCallStatusTone = 'error' | 'info' | 'loading';

/**
 * Экран-статус встречи (ссылка недействительна, нужно войти, проверка приглашения).
 * Крупная иконка, заголовок и пояснение по центру, действия внизу — одинаково хорошо на телефоне,
 * планшете и компьютере.
 */
export function GlassCallStatus({
  tone = 'info',
  icon,
  title,
  lead,
  chip,
  closeTo,
  primary,
  secondary,
}: {
  tone?: GlassCallStatusTone;
  icon?: ReactNode;
  title: string;
  lead?: string;
  /** Небольшая подпись над заголовком (например, название встречи). */
  chip?: string;
  closeTo: string;
  primary?: { label: string; to: string };
  secondary?: { label: string; to: string };
}) {
  return (
    <GlassCallShell className={`glass-call--status glass-call--status-${tone}`} closeTo={closeTo}>
      <div className="glass-call__status-body" aria-live="polite">
        <div className="glass-call__status-icon-wrap" aria-hidden>
          <span className="glass-call__status-ring" />
          <span className="glass-call__status-badge">
            {tone === 'loading' ? <span className="glass-call__spinner glass-call__spinner--lg" /> : icon}
          </span>
        </div>
        {chip ? <p className="glass-call__status-chip">{chip}</p> : null}
        <GlassCallTitle title={title} />
        {lead ? <p className="glass-call__status-lead">{lead}</p> : null}
      </div>
      {primary || secondary ? (
        <div className="glass-call__status-actions">
          {primary ? <GlassCallCta to={primary.to}>{primary.label}</GlassCallCta> : null}
          {secondary ? (
            <GlassCallCta to={secondary.to} variant="ghost">
              {secondary.label}
            </GlassCallCta>
          ) : null}
        </div>
      ) : null}
    </GlassCallShell>
  );
}
