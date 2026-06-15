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
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '14px',
        fontWeight: 500,
      }}
    >
      <span>
        👁 Вы просматриваете аккаунт: <strong>{targetMember.name}</strong>
        &nbsp;·&nbsp; Чаты недоступны
      </span>
      <button
        type="button"
        onClick={() => void exitImpersonation()}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: '#fff',
          borderRadius: '6px',
          padding: '4px 12px',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        ✕ Выйти из аккаунта
      </button>
    </div>
  );
}
