import type { BibleTranslation } from '../api';

type Props = {
  translations: BibleTranslation[];
  value: string;
  onChange: (code: string) => void;
};

export function TranslationPicker({ translations, value, onChange }: Props) {
  if (translations.length === 0) return null;
  const current = translations.find((t) => t.code === value) ?? translations[0];

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
        Перевод
      </label>
      <div className="flex flex-wrap gap-2">
        {translations.map((t) => {
          const active = t.code === value;
          const empty = !(t.verse_count && t.verse_count > 0);
          return (
            <button
              key={t.code}
              type="button"
              onClick={() => onChange(t.code)}
              className={[
                'rounded-2xl border px-3 py-2 text-left text-sm transition',
                active
                  ? 'border-primary bg-primary/10 text-stone-900'
                  : 'border-stone-200 bg-[var(--surface-elevated)] text-stone-700 hover:border-primary/40',
              ].join(' ')}
            >
              <span className="font-bold">{t.short_title || t.title}</span>
              {empty ? (
                <span className="ml-1 text-[10px] font-semibold uppercase text-stone-400">нет текста</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {current ? (
        <p className="text-sm leading-relaxed text-stone-600">
          <span className="font-semibold text-stone-800">{current.title}</span>
          {current.year ? <span className="text-stone-400"> · {current.year}</span> : null}
          {current.description ? <> — {current.description}</> : null}
        </p>
      ) : null}
    </div>
  );
}
