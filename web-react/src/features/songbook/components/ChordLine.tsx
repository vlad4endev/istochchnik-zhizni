import type { ParsedChordLine } from '../utils/chordSegments';
import { SongLine } from '../../../components/shared/SongRenderer';

type ChordLineProps = {
  line: ParsedChordLine;
  /** Если false — скрываем подписи аккордов, но сохраняем высоту chord-строки. */
  chordsVisible: boolean;
  /** Режим привязки аккордов: моноширинная сетка или измерение реальной ширины текста. */
  layoutMode?: 'mono' | 'measured';
  /** Доп. класс для строки-обёртки. */
  className?: string;
  /** Тон аккордов: на тёмном фоне — `dark`, на светлом — `light`. */
  chordTone?: 'light' | 'dark';
};

export function ChordLine({
  line,
  chordsVisible,
  layoutMode = 'mono',
  className = '',
  chordTone = 'light',
}: ChordLineProps) {
  return <SongLine line={line} chordsVisible={chordsVisible} chordTone={chordTone} layoutMode={layoutMode} className={className} />;
}
