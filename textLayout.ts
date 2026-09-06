import { SentenceUnit } from './textParser';

export interface TextLine { text: string; unitIndex: number; y: number }

/** Lay out ALL units before revealing any: hidden sentences retain their space. */
export function layoutText(
  units: SentenceUnit[], width: number, lineHeight: number,
  measure: (text: string) => number,
): { lines: TextLine[]; height: number } {
  const lines: TextLine[] = [];
  let y = 0;
  units.forEach((unit, unitIndex) => {
    if (unit.hasEmptyLineBefore && unitIndex > 0) y += lineHeight * 0.5;
    let line = '';
    const flush = () => {
      if (!line) return;
      lines.push({ text: line, unitIndex, y });
      y += lineHeight;
      line = '';
    };
    for (const word of unit.text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= width) { line = candidate; continue; }
      flush();
      // Break long unspaced tokens too, rather than painting across neighbouring boxes.
      for (const char of word) {
        if (line && measure(line + char) > width) flush();
        line += char;
      }
    }
    flush();
  });
  return { lines, height: y };
}
