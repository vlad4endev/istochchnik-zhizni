import { useCallback, useState, type ReactNode } from 'react';
import { LuLink2, LuMic, LuMicOff, LuVideo, LuVideoOff, LuX } from 'react-icons/lu';

import { BodyPortal } from '../../components/BodyPortal';
import { emitAppToast } from '../../lib/uiFeedback';

import { startStandaloneMeetingCall } from './startMeetingCall';
import './calls.css';

type MediaType = 'audio' | 'video';

type CreateMeetingDialogProps = {
  mediaType: MediaType;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
};

export function CreateMeetingDialog({ mediaType, onClose, onCreated }: CreateMeetingDialogProps) {
  const isVideo = mediaType === 'video';
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(isVideo);
  const [busy, setBusy] = useState(false);

  const title = isVideo ? 'Видеовстреча' : 'Аудиовстреча';
  const cta = isVideo ? 'Создать видеовстречу' : 'Создать аудиовстречу';
  const hint = isVideo
    ? 'Ссылка скопируется автоматически — отправьте её участникам. Камеру можно выключить до входа.'
    : 'Ссылка скопируется автоматически. Участники подключатся только с голосом.';

  const create = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (micOn || (isVideo && camOn)) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: micOn,
            video: isVideo && camOn,
          });
          stream.getTracks().forEach((t) => t.stop());
        } catch (e) {
          emitAppToast(
            e instanceof Error && e.name === 'NotAllowedError'
              ? 'Нет доступа к микрофону или камере'
              : 'Не удалось получить доступ к устройствам',
            'error',
          );
          setBusy(false);
          return;
        }
      }
      const result = await startStandaloneMeetingCall(mediaType);
      if (result?.conversationId) {
        onCreated(result.conversationId);
      }
    } catch (e) {
      emitAppToast(e instanceof Error ? e.message : 'Не удалось создать встречу', 'error');
    } finally {
      setBusy(false);
    }
  }, [busy, camOn, isVideo, mediaType, micOn, onCreated]);

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
          <p className="telemost-create__eyebrow">Источник жизни · встречи</p>
          <div className="telemost-create__hero" aria-hidden>
            <span className="telemost-create__ring" />
            <span className="telemost-create__ring telemost-create__ring--late" />
            <span className="telemost-create__badge">
              {isVideo ? <LuVideo size={34} strokeWidth={1.75} /> : <LuMic size={34} strokeWidth={1.75} />}
            </span>
          </div>

          <h1 id="telemost-create-title" className="telemost-create__title">
            {title}
          </h1>
          <p className="telemost-create__lead">{hint}</p>

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

          <button type="button" className="telemost-create__cta" disabled={busy} onClick={() => void create()}>
            {busy ? 'Создаём…' : cta}
          </button>

          <p className="telemost-create__foot">
            <LuLink2 size={16} aria-hidden />
            Ссылка появится сразу после создания
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
