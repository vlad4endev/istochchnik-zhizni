/**
 * Разбивает одну строку ChordPro на сегменты: аккорд над следующим фрагментом текста.
 *
 * Пример: `"Б[C]ога я [Am]вижу"` →
 * `[{ chord: "", text: "Б" }, { chord: "C", text: "ога я " }, { chord: "Am", text: "вижу" }]`
 */
export type ChordTextSegment = { chord: string; text: string };

export function splitChordSegments(line: string): ChordTextSegment[] {
  const out: ChordTextSegment[] = [];
  let i = 0;

  while (i < line.length) {
    if (line[i] === '[') {
      const close = line.indexOf(']', i + 1);
      if (close === -1) {
        out.push({ chord: '', text: line.slice(i) });
        break;
      }
      const chord = line.slice(i + 1, close);
      i = close + 1;
      let end = i;
      while (end < line.length && line[end] !== '[') {
        end++;
      }
      const text = line.slice(i, end);
      out.push({ chord, text });
      i = end;
    } else {
      const nextBracket = line.indexOf('[', i);
      const end = nextBracket === -1 ? line.length : nextBracket;
      const text = line.slice(i, end);
      out.push({ chord: '', text });
      i = end;
    }
  }

  if (out.length === 0) {
    out.push({ chord: '', text: '' });
  }

  return out;
}
