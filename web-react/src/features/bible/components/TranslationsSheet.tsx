import { LuCloud, LuEllipsis } from 'react-icons/lu';

import type { BibleTranslation } from '../api';
import { translationBadge, translationPublisher } from '../bibleUiMeta';
import { BibleSheetShell } from './BibleSheetShell';

type Props = {
  open: boolean;
  translations: BibleTranslation[];
  value: string;
  onClose: () => void;
  onChange: (code: string) => void;
};

export function TranslationsSheet({ open, translations, value, onClose, onChange }: Props) {
  const withText = translations.filter((t) => (t.verse_count ?? 0) > 0);
  const withoutText = translations.filter((t) => !(t.verse_count && t.verse_count > 0));

  return (
    <BibleSheetShell
      open={open}
      title="Мои переводы"
      onClose={onClose}
      showMore
      footer={
        <div className="space-y-2 text-center">
          <p className="rounded-full bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700">
            Переводов в приложении: {translations.length}
          </p>
          <p className="text-xs text-stone-400">
            С текстом: {withText.length}
            {withoutText.length ? ` · без текста: ${withoutText.length}` : ''}
          </p>
        </div>
      }
    >
      <ul className="divide-y divide-stone-100">
        {translations.map((t) => {
          const active = t.code === value;
          const empty = !(t.verse_count && t.verse_count > 0);
          return (
            <li key={t.code}>
              <button
                type="button"
                onClick={() => {
                  onChange(t.code);
                  onClose();
                }}
                className={[
                  'flex w-full items-center gap-3 px-4 py-3.5 text-left transition',
                  active ? 'bg-[#f3e8e4]' : 'bg-white hover:bg-stone-50',
                ].join(' ')}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-[11px] font-bold tracking-wide text-stone-800">
                  {translationBadge(t)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-stone-400">
                    {translationPublisher(t)}
                  </span>
                  <span className="mt-0.5 block truncate text-[15px] font-bold text-stone-900">
                    {t.title}
                  </span>
                  {empty ? (
                    <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                      текст не загружен
                    </span>
                  ) : null}
                </span>
                {empty ? <LuCloud size={18} className="shrink-0 text-stone-400" /> : null}
                <LuEllipsis size={18} className="shrink-0 text-stone-300" />
              </button>
            </li>
          );
        })}
      </ul>
    </BibleSheetShell>
  );
}
