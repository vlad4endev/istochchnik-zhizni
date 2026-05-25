import {
  patchStageSetupFlags,
  readStageSetupFlags,
  stageSetupProgramLines,
} from '../stageSetupFlags';

type Props = {
  contentJson: Record<string, unknown>;
  onChange: (contentJson: Record<string, unknown>) => void;
  className?: string;
};

export function BlockStageSetupFields({ contentJson, onChange, className = '' }: Props) {
  const { removeMicStands, removePulpits } = readStageSetupFlags(contentJson);

  return (
    <fieldset
      className={`rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-2.5 ${className}`.trim()}
    >
      <legend className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
        Сцена перед блоком
      </legend>
      <div className="mt-1.5 space-y-2">
        <label className="flex cursor-pointer items-start gap-2 text-sm text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 accent-primary"
            checked={removeMicStands}
            onChange={(e) =>
              onChange(patchStageSetupFlags(contentJson, { removeMicStands: e.target.checked }))
            }
          />
          <span>Убираем микрофонные стойки</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 accent-primary"
            checked={removePulpits}
            onChange={(e) =>
              onChange(patchStageSetupFlags(contentJson, { removePulpits: e.target.checked }))
            }
          />
          <span>Убираем пюпитры</span>
        </label>
      </div>
    </fieldset>
  );
}

/** Строки для карточки блока в программе. */
export function BlockStageSetupPreview({
  contentJson,
  className = '',
}: {
  contentJson: Record<string, unknown> | null | undefined;
  className?: string;
}) {
  const lines = stageSetupProgramLines(contentJson);
  if (lines.length === 0) return null;
  return (
    <ul className={`mt-1 space-y-0.5 text-xs leading-snug text-stone-600 sm:text-sm ${className}`.trim()}>
      {lines.map((line) => (
        <li key={line} className="font-medium">
          {line}
        </li>
      ))}
    </ul>
  );
}
