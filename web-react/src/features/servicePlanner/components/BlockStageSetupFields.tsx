import {
  patchStageSetupPlaceEquipment,
  patchStageSetupRemoveEquipment,
  readStageSetupFlags,
  STAGE_SETUP_PROGRAM_MARK_PLACE,
  STAGE_SETUP_PROGRAM_MARK_REMOVE,
  stageSetupDisplayLines,
  type StageSetupDisplayLine,
} from '../stageSetupFlags';

type Props = {
  contentJson: Record<string, unknown>;
  onChange: (contentJson: Record<string, unknown>) => void;
  className?: string;
};

const checkboxClass =
  'mt-0.5 h-4 w-4 min-h-4 min-w-4 max-w-4 shrink-0 rounded border-stone-300 accent-primary';

function ProgramMark({ line, className = '' }: { line: StageSetupDisplayLine; className?: string }) {
  const mark = line.mark === 'place' ? STAGE_SETUP_PROGRAM_MARK_PLACE : STAGE_SETUP_PROGRAM_MARK_REMOVE;
  return (
    <span
      className={`inline-block shrink-0 leading-none ${
        line.mark === 'place' ? 'text-stone-700' : 'font-bold text-red-600'
      } ${className}`.trim()}
      aria-hidden
    >
      {mark}
    </span>
  );
}

export function BlockStageSetupFields({ contentJson, onChange, className = '' }: Props) {
  const { removeEquipment, placeEquipment } = readStageSetupFlags(contentJson);

  return (
    <div
      className={`min-w-0 w-full rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-2.5 ${className}`.trim()}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
        Сцена перед блоком
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-stone-500">
        Можно выбрать только один вариант — он появится в итоговой программе.
      </p>
      <div className="mt-1.5 space-y-2.5">
        <label className="flex w-full min-w-0 cursor-pointer items-start gap-2.5 text-sm leading-snug text-stone-800">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={removeEquipment}
            onChange={(e) =>
              onChange(patchStageSetupRemoveEquipment(contentJson, e.target.checked))
            }
          />
          <span className="min-w-0 flex-1">
            <span className="block">Убираем микрофонные стойки и пюпитры</span>
            {removeEquipment ? (
              <span className="mt-1 block space-y-0.5 text-[11px] leading-snug text-stone-600">
                <span className="flex items-start gap-1">
                  <ProgramMark
                    line={{ mark: 'remove', text: 'Убираем микрофонные стойки' }}
                    className="text-[11px]"
                  />
                  <span>Убираем микрофонные стойки</span>
                </span>
                <span className="flex items-start gap-1">
                  <ProgramMark line={{ mark: 'remove', text: 'Убираем пюпитры' }} className="text-[11px]" />
                  <span>Убираем пюпитры</span>
                </span>
              </span>
            ) : null}
          </span>
        </label>
        <label className="flex w-full min-w-0 cursor-pointer items-start gap-2.5 text-sm leading-snug text-stone-800">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={placeEquipment}
            onChange={(e) =>
              onChange(patchStageSetupPlaceEquipment(contentJson, e.target.checked))
            }
          />
          <span className="flex min-w-0 flex-1 items-start gap-1.5">
            {placeEquipment ? (
              <ProgramMark
                line={{ mark: 'place', text: 'Выставляем микрофоны и пюпитры' }}
                className="mt-0.5 text-base"
              />
            ) : (
              <span className="mt-0.5 text-base leading-none text-stone-400" aria-hidden>
                {STAGE_SETUP_PROGRAM_MARK_PLACE}
              </span>
            )}
            <span className="min-w-0 flex-1">Выставляем микрофоны и пюпитры</span>
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
      className={`mt-0.5 space-y-0.5 text-[11px] leading-snug text-stone-600 sm:text-xs ${className}`.trim()}
    >
      {lines.map((line) => (
        <li key={line.text} className="flex items-start gap-1">
          <ProgramMark line={line} className="text-[11px] sm:text-xs" />
          <span className="min-w-0 flex-1">{line.text}</span>
        </li>
      ))}
    </ul>
  );
}
