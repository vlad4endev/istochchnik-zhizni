/**
 * Разбивает одну строку ChordPro на сегменты: аккорд над следующим фрагментом текста.
 *
 * Пример: `"Б[C]ога я [Am]вижу"` →
 * `[{ chord: "", text: "Б" }, { chord: "C", text: "ога я " }, { chord: "Am", text: "вижу" }]`
 */
export type ChordTextSegment = {
  chord: string;
  text: string;
  /** Позиция сегмента в «чистом» тексте строки (без аккордных скобок). */
  charIndex: number;
};

export function splitChordSegments(line: string): ChordTextSegment[] {
  const out: ChordTextSegment[] = [];
  let i = 0;
  let textCursor = 0;

  while (i < line.length) {
    if (line[i] === '[') {
      const close = line.indexOf(']', i + 1);
      if (close === -1) {
        const tail = line.slice(i);
        out.push({ chord: '', text: tail, charIndex: textCursor });
        textCursor += tail.length;
        break;
      }
      const chord = line.slice(i + 1, close);
      i = close + 1;
      let end = i;
      while (end < line.length && line[end] !== '[') {
        end++;
      }
      const text = line.slice(i, end);
      out.push({ chord, text, charIndex: textCursor });
      textCursor += text.length;
      i = end;
    } else {
      const nextBracket = line.indexOf('[', i);
      const end = nextBracket === -1 ? line.length : nextBracket;
      const text = line.slice(i, end);
      out.push({ chord: '', text, charIndex: textCursor });
      textCursor += text.length;
      i = end;
    }
  }

  if (out.length === 0) {
    out.push({ chord: '', text: '', charIndex: 0 });
  }

  return out;
}
