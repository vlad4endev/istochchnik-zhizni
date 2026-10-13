import { useCallback, useId, useState, type ReactNode } from 'react';
import {
  LuLink2,
  LuMic,
  LuMicOff,
  LuMoon,
  LuSun,
  LuVideo,
  LuVideoOff,
  LuX,
} from 'react-icons/lu';

import { BodyPortal } from '../../components/BodyPortal';
import { useMe } from '../../hooks/useMe';
import { emitAppToast } from '../../lib/uiFeedback';
import {
  PRAYER_WATCH_MEETING_TEMPLATES,
  userCanUsePrayerWatchMeetingTemplates,
  type PrayerWatchMeetingTemplateId,
} from '../calendar/prayerAccess';

import { startStandaloneMeetingCall } from './startMeetingCall';
import './calls.css';

type MediaType = 'audio' | 'video';

type CreateMeetingDialogProps = {
  mediaType: MediaType;
  onClose: () => void;
  /** Called after the call window opens (no chat is created). */
  onCreated: () => void;
};

const MAX_TITLE = 80;

export function CreateMeetingDialog({ mediaType, onClose, onCreated }: CreateMeetingDialogProps) {
  const isVideo = mediaType === 'video';
  const nameId = useId();
  const meQ = useMe();
  const showPrayerTemplates = userCanUsePrayerWatchMeetingTemplates(meQ.data);

  const [meetingName, setMeetingName] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(isVideo);
  const [busy, setBusy] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<PrayerWatchMeetingTemplateId | null>(null);

  const defaultTitle = isVideo ? 'Видеовстреча' : 'Аудиовстреча';
  const cta = isVideo ? 'Создать видеовстречу' : 'Создать аудиовстречу';
  const hint = showPrayerTemplates
    ? 'Выберите стражу — встреча сразу откроется, название и ссылка скопируются для рассылки.'
    : isVideo
      ? 'Создаётся только звонок по ссылке — без группы в чатах. После завершения всё закрывается.'
      : 'Только звонок по ссылке, без группы. Участники подключатся с голосом; после завершения всё закрывается.';

  const ensureDevices = useCallback(async (): Promise<boolean> => {
    if (!(micOn || (isVideo && camOn))) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micOn,
        video: isVideo && camOn,
      });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch (e) {
      emitAppToast(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Нет доступа к микрофону или камере'
          : 'Не удалось получить доступ к устройствам',
        'error',
      );
      return false;
    }
  }, [camOn, isVideo, micOn]);

  const createWithTitle = useCallback(
    async (rawTitle: string | undefined, templateId?: PrayerWatchMeetingTemplateId) => {
      if (busy) return;
      setBusy(true);
      if (templateId) setPendingTemplate(templateId);
      try {
        const ok = await ensureDevices();
        if (!ok) return;
        const title = rawTitle?.trim().slice(0, MAX_TITLE) || undefined;
        const result = await startStandaloneMeetingCall(mediaType, {
          title,
          micOn,
          camOn: isVideo && camOn,
        });
        if (result?.callId) {
          onCreated();
        }
      } catch (e) {
        emitAppToast(e instanceof Error ? e.message : 'Не удалось создать встречу', 'error');
      } finally {
        setBusy(false);
        setPendingTemplate(null);
      }
    },
    [busy, camOn, ensureDevices, isVideo, mediaType, micOn, onCreated],
  );

  const createCustom = useCallback(() => {
    void createWithTitle(meetingName.trim() || undefined);
  }, [createWithTitle, meetingName]);

  return (
    <BodyPortal>
      <div className="telemost-create" role="dialog" aria-modal="true" aria-labelledby="telemost-create-title">
        <div className="telemost-create__atmosphere" aria-hidden>
          <span className="telemost-create__glow telemost-create__glow--a" />
          <span className="telemost-create__glow telemost-create__glow--b" />
        </div>

        <button type="button" className="telemost-create__close" onClick={onClose} aria-label="Закрыть" disabled={busy}>
          <LuX size={22} strokeWidth={2.25} />
        </button>

        <div className="telemost-create__panel">
          <p className="telemost-create__eyebrow">
            {showPrayerTemplates ? 'Молитвенные стражи' : 'Источник жизни · встречи'}
          </p>
          <div className="telemost-create__hero" aria-hidden>
            <span className="telemost-create__ring" />
            <span className="telemost-create__ring telemost-create__ring--late" />
            <span className="telemost-create__badge">
              {isVideo ? <LuVideo size={34} strokeWidth={1.75} /> : <LuMic size={34} strokeWidth={1.75} />}
            </span>
          </div>

          <h1 id="telemost-create-title" className="telemost-create__title">
            {showPrayerTemplates ? 'Создать стражу' : defaultTitle}
          </h1>
          <p className="telemost-create__lead">{hint}</p>

          {showPrayerTemplates ? (
            <div className="telemost-create__templates" role="group" aria-label="Шаблоны названия">
              {PRAYER_WATCH_MEETING_TEMPLATES.map((tpl) => {
                const isMorning = tpl.id === 'morning';
                const starting = busy && pendingTemplate === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    className={[
                      'telemost-create__template',
                      isMorning ? 'telemost-create__template--morning' : 'telemost-create__template--evening',
                      starting ? 'is-starting' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={busy}
                    onClick={() => void createWithTitle(tpl.title, tpl.id)}
                  >
                    <span className="telemost-create__template-icon" aria-hidden>
                      {isMorning ? <LuSun size={22} strokeWidth={2} /> : <LuMoon size={22} strokeWidth={2} />}
                    </span>
                    <span className="telemost-create__template-copy">
                      <span className="telemost-create__template-short">{tpl.short}</span>
                      <span className="telemost-create__template-title">{tpl.title}</span>
                      <span className="telemost-create__template-hint">
                        {starting ? 'Создаём…' : tpl.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <label className="telemost-create__name" htmlFor={nameId}>
              <span className="telemost-create__name-label">Название встречи</span>
              <input
                id={nameId}
                type="text"
                className="telemost-create__name-input"
                value={meetingName}
                onChange={(e) => setMeetingName(e.target.value.slice(0, MAX_TITLE))}
                placeholder={defaultTitle}
                maxLength={MAX_TITLE}
                autoComplete="off"
                disabled={busy}
                enterKeyHint="done"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    createCustom();
                  }
                }}
              />
            </label>
          )}

          <div className="telemost-create__devices" role="group" aria-label="Устройства перед входом">
            <DeviceToggle
              pressed={micOn}
              onClick={() => setMicOn((v) => !v)}
              labelOn="Микрофон"
              labelOff="Микрофон выкл."
              iconOn={<LuMic size={20} strokeWidth={2.1} />}
              iconOff={<LuMicOff size={20} strokeWidth={2.1} />}
            />
            {isVideo ? (
              <DeviceToggle
                pressed={camOn}
                onClick={() => setCamOn((v) => !v)}
                labelOn="Камера"
                labelOff="Камера выкл."
                iconOn={<LuVideo size={20} strokeWidth={2.1} />}
                iconOff={<LuVideoOff size={20} strokeWidth={2.1} />}
              />
            ) : null}
          </div>

          {!showPrayerTemplates ? (
            <button type="button" className="telemost-create__cta" disabled={busy} onClick={createCustom}>
              {busy ? 'Создаём…' : cta}
            </button>
          ) : null}

          <p className="telemost-create__foot">
            <LuLink2 size={16} aria-hidden />
            {showPrayerTemplates
              ? 'После старта: «Скопировать» — название и ссылка одной вставкой'
              : 'В ссылке для шаринга будет название и адрес'}
          </p>
        </div>
      </div>
    </BodyPortal>
  );
}

function DeviceToggle({
  pressed,
  onClick,
  labelOn,
  labelOff,
  iconOn,
  iconOff,
}: {
  pressed: boolean;
  onClick: () => void;
  labelOn: string;
  labelOff: string;
  iconOn: ReactNode;
  iconOff: ReactNode;
}) {
  return (
    <button
      type="button"
      className={['telemost-create__device', pressed ? 'is-on' : 'is-off'].join(' ')}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span className="telemost-create__device-icon" aria-hidden>
        {pressed ? iconOn : iconOff}
      </span>
      <span>{pressed ? labelOn : labelOff}</span>
    </button>
  );
}
