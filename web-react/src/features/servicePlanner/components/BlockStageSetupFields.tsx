import {
  patchStageSetupFlags,
  readStageSetupFlags,
  STAGE_SETUP_PROGRAM_MARK,
  stageSetupDisplayLines,
} from '../stageSetupFlags';

type Props = {
  contentJson: Record<string, unknown>;
  onChange: (contentJson: Record<string, unknown>) => void;
  className?: string;
};

const checkboxClass =
  'mt-0.5 h-4 w-4 min-h-4 min-w-4 max-w-4 shrink-0 rounded border-stone-300 accent-primary';

function StageSetupMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 font-bold leading-none text-red-600 ${className}`.trim()}
      aria-hidden
    >
      {STAGE_SETUP_PROGRAM_MARK}
    </span>
  );
}

export function BlockStageSetupFields({ contentJson, onChange, className = '' }: Props) {
  const { removeMicStands, removePulpits } = readStageSetupFlags(contentJson);

  return (
    <div
      className={`min-w-0 w-full rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-2.5 ${className}`.trim()}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
        Сцена перед блоком
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-stone-500">
        В программе отмеченные пункты показываются с{' '}
        <StageSetupMark className="text-[13px]" /> .
      </p>
      <div className="mt-1.5 space-y-2">
        <label className="flex w-full min-w-0 cursor-pointer items-start gap-2.5 text-sm leading-snug text-stone-800">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={removeMicStands}
            onChange={(e) =>
              onChange(patchStageSetupFlags(contentJson, { removeMicStands: e.target.checked }))
            }
          />
          <span className="flex min-w-0 flex-1 items-start gap-1.5">
            {removeMicStands ? <StageSetupMark className="mt-0.5 text-base" /> : null}
            <span className="min-w-0 flex-1">Убираем микрофонные стойки</span>
          </span>
        </label>
        <label className="flex w-full min-w-0 cursor-pointer items-start gap-2.5 text-sm leading-snug text-stone-800">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={removePulpits}
            onChange={(e) =>
              onChange(patchStageSetupFlags(contentJson, { removePulpits: e.target.checked }))
            }
          />
          <span className="flex min-w-0 flex-1 items-start gap-1.5">
            {removePulpits ? <StageSetupMark className="mt-0.5 text-base" /> : null}
            <span className="min-w-0 flex-1">Убираем пюпитры</span>
          </span>
        </label>
      </div>
    </div>
  );
}

/** Строки для карточки блока в итоговой программе. */
export function BlockStageSetupPreview({
  contentJson,
  className = '',
}: {
  contentJson: Record<string, unknown> | null | undefined;
  className?: string;
}) {
  const lines = stageSetupDisplayLines(contentJson);
  if (lines.length === 0) return null;
  return (
    <ul
      className={`mt-1 space-y-1 text-xs leading-snug text-stone-700 sm:text-sm ${className}`.trim()}
    >
      {lines.map((line) => (
        <li key={line.text} className="flex items-start gap-1.5 font-semibold">
          <StageSetupMark className="mt-px text-sm sm:text-base" />
          <span className="min-w-0 flex-1">{line.text}</span>
        </li>
      ))}
    </ul>
  );
}
