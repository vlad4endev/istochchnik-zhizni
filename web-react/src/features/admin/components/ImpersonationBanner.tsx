import { useImpersonation, useImpersonationBodyOffset } from '../hooks/useImpersonation';

export function ImpersonationBanner() {
  const { isImpersonating, targetMember, exitImpersonation } = useImpersonation();
  useImpersonationBodyOffset(isImpersonating);

  if (!isImpersonating || !targetMember) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#7d3640',
        color: '#fff',
        paddingTop: 'max(8px, env(safe-area-inset-top, 0px))',
        paddingBottom: '8px',
        paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(12px, env(safe-area-inset-right, 0px))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        flexWrap: 'wrap',
        fontSize: '14px',
        fontWeight: 500,
      }}
    >
      <span style={{ minWidth: 0, flex: '1 1 12rem' }}>
        Вы просматриваете аккаунт: <strong>{targetMember.name}</strong>
        <span style={{ opacity: 0.85 }}> · Чаты недоступны</span>
      </span>
      <button
        type="button"
        onClick={() => void exitImpersonation()}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: '#fff',
          borderRadius: '6px',
          padding: '6px 12px',
          cursor: 'pointer',
          fontWeight: 600,
          flexShrink: 0,
          minHeight: '36px',
        }}
      >
        Выйти из аккаунта
      </button>
    </div>
  );
}
