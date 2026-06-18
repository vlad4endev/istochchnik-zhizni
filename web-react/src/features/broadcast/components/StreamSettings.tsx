import type { CSSProperties } from 'react';
import type { BroadcastData } from '../../../api/broadcast';

interface StreamSettingsProps {
  formTitle: string;
  formStreamUrl: string;
  formDescription: string;
  formNotifyMembers: boolean;
  formIsPublic: boolean;
  formPlatform: BroadcastData['platform'];
  datePart: string;
  timePart: string;
  smartInput: string;
  streamUrlError: string | null;
  isSaving: boolean;

  onTitleChange: (v: string) => void;
  onStreamUrlChange: (v: string) => void;
  onStreamUrlBlur: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onNotifyMembersChange: (v: boolean) => void;
  onIsPublicChange: (v: boolean) => void;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  onSmartInputChange: (v: string) => void;
  onApplySmartInput: () => void;
  onSave: () => void;
}

export function StreamSettings(props: StreamSettingsProps) {
  const {
    formTitle, formStreamUrl, formDescription,
    formNotifyMembers, formIsPublic, formPlatform,
    datePart, timePart, smartInput, streamUrlError, isSaving,
    onTitleChange, onStreamUrlChange, onStreamUrlBlur, onDescriptionChange,
    onNotifyMembersChange, onIsPublicChange,
    onDateChange, onTimeChange, onSmartInputChange, onApplySmartInput, onSave,
  } = props;

  const platformLabel = platformDisplayLabel(formPlatform);

  return (
    <div style={ss.wrap}>
      {/* Admin badge */}
      <div style={ss.adminBadge}>
        🔒 Только для администраторов
      </div>

      {/* Main settings card */}
      <div style={ss.card}>
        {/* Smart paste block */}
        <div style={ss.smartBlock}>
          <div style={ss.smartTitle}>Умная вставка</div>
          <div style={ss.smartDesc}>
            Вставь ссылку YouTube / RuTube / VK или готовый iframe
          </div>
          <div style={ss.smartRow}>
            <textarea
              value={smartInput}
              onChange={(e) => onSmartInputChange(e.target.value)}
              placeholder={'https://rutube.ru/video/...\nили <iframe src="...">'}
              style={ss.smartInput}
              rows={2}
            />
            <button type="button" style={ss.smartBtn} onClick={onApplySmartInput}>
              Применить
            </button>
          </div>
        </div>

        <div style={ss.divider} />

        {/* Title */}
        <Field label="Название">
          <input
            style={ss.input}
            value={formTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Воскресное богослужение"
          />
        </Field>

        {/* Stream URL */}
        <Field label="URL трансляции">
          <input
            style={{ ...ss.input, fontSize: 11, color: '#7B1C1C' }}
            value={formStreamUrl}
            onChange={(e) => onStreamUrlChange(e.target.value)}
            onBlur={(e) => onStreamUrlBlur(e.target.value)}
            placeholder="Будет заполнено автоматически"
          />
          {formStreamUrl && (
            <div style={ss.platformChip}>
              Платформа: {platformLabel}
            </div>
          )}
          {streamUrlError && (
            <div style={ss.urlError}>{streamUrlError}</div>
          )}
        </Field>

        {/* Date + Time side by side */}
        <div style={ss.dateTimeRow}>
          <Field label="Дата начала">
            <input
              style={ss.input}
              type="date"
              value={datePart}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </Field>
          <Field label="Время начала">
            <input
              style={ss.input}
              type="time"
              value={timePart}
              onChange={(e) => onTimeChange(e.target.value)}
            />
          </Field>
        </div>

        {/* Description */}
        <Field label="Описание">
          <textarea
            style={{ ...ss.input, minHeight: 72, resize: 'vertical' } as CSSProperties}
            value={formDescription}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Краткое описание богослужения..."
          />
        </Field>
      </div>

      {/* Toggle settings card */}
      <div style={ss.card}>
        <Toggle
          label="Уведомить участников"
          sub="пуш-уведомление при сохранении"
          value={formNotifyMembers}
          onChange={onNotifyMembersChange}
        />
        <div style={ss.divider} />
        <Toggle
          label="Публичная трансляция"
          sub="доступна без авторизации"
          value={formIsPublic}
          onChange={onIsPublicChange}
        />
      </div>

      <button
        type="button"
        style={{
          ...ss.saveBtn,
          opacity: isSaving || Boolean(streamUrlError) ? 0.6 : 1,
          cursor: isSaving || Boolean(streamUrlError) ? 'not-allowed' : 'pointer',
        }}
        onClick={onSave}
        disabled={isSaving || Boolean(streamUrlError)}
      >
        {isSaving ? 'Сохранение...' : '✓ Сохранить и опубликовать'}
      </button>
    </div>
  );
}

function platformDisplayLabel(platform: BroadcastData['platform']): string {
  if (platform === 'youtube') return 'YouTube';
  if (platform === 'rutube') return 'RuTube';
  if (platform === 'vk') return 'VK Видео';
  return 'Не определена';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={ss.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

function Toggle({ label, sub, value, onChange }: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={ss.toggleRow}>
      <div>
        <div style={ss.toggleLabel}>{label}</div>
        {sub && <div style={ss.toggleSub}>{sub}</div>}
      </div>
      <div
        role="switch"
        aria-checked={value}
        tabIndex={0}
        onClick={() => onChange(!value)}
        onKeyDown={(e) => e.key === 'Enter' && onChange(!value)}
        style={{
          ...ss.toggle,
          background: value ? '#7B1C1C' : '#E0E0E0',
        }}
      >
        <div style={{
          ...ss.toggleThumb,
          transform: value ? 'translateX(18px)' : 'translateX(0)',
        }} />
      </div>
    </div>
  );
}

const BRAND = '#7B1C1C';

const ss: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  adminBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    background: '#FAEEDA',
    border: '1px solid rgba(133,79,11,0.2)',
    borderRadius: 10,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: '#854F0B',
  },
  card: {
    background: '#fff',
    borderRadius: 20,
    border: '1px solid rgba(0,0,0,0.07)',
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  smartBlock: {
    background: '#F4F0EE',
    borderRadius: 14,
    padding: 13,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  smartTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#111',
  },
  smartDesc: {
    fontSize: 11,
    color: '#999',
    lineHeight: 1.4,
  },
  smartRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
  },
  smartInput: {
    flex: 1,
    background: '#fff',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 10,
    padding: '8px 11px',
    fontSize: 12,
    color: '#111',
    fontFamily: 'inherit',
    outline: 'none',
    resize: 'none',
    lineHeight: 1.4,
  } as CSSProperties,
  smartBtn: {
    background: BRAND,
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '8px 13px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    alignSelf: 'flex-end',
    WebkitTapHighlightColor: 'transparent',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  input: {
    background: '#fff',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 13,
    color: '#111',
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  platformChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: '#FDE8E8',
    borderRadius: 7,
    padding: '4px 9px',
    fontSize: 11,
    fontWeight: 600,
    color: BRAND,
    marginTop: 4,
  },
  urlError: {
    fontSize: 11,
    fontWeight: 600,
    color: '#DC2626',
    marginTop: 2,
  },
  dateTimeRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  divider: {
    height: 0.5,
    background: 'rgba(0,0,0,0.06)',
    margin: '0 -14px',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 0',
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: '#111',
  },
  toggleSub: {
    fontSize: 11,
    color: '#999',
    marginTop: 1,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    position: 'relative',
    cursor: 'pointer',
    transition: 'background 0.2s',
    flexShrink: 0,
    WebkitTapHighlightColor: 'transparent',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute',
    top: 2,
    left: 2,
    transition: 'transform 0.2s',
    boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
  },
  saveBtn: {
    background: BRAND,
    color: '#fff',
    border: 'none',
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    WebkitTapHighlightColor: 'transparent',
  },
};
