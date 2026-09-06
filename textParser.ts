/**
 * Text parsing and sentence-level sequential animation helper.
 * Accurately parses paragraphs, blank lines, bullets (*, •, -, ✓, ~, etc.),
 * and splits multi-sentence paragraphs into sequential animation units.
 */

export interface SentenceUnit {
  id: string;
  text: string;
  isNewParagraph: boolean;
  hasEmptyLineBefore: boolean;
  isBullet: boolean;
  bulletGlyph?: string;
}

/**
 * Splits text into individual sentences and paragraphs while preserving:
 * - Paragraph breaks (\n)
 * - Blank lines (\n\n, "dejando un renglón")
 * - Bullets (*, •, -, ✓, ~, 1., etc.)
 * - Multi-sentence paragraphs split into sentences for sequential appearance
 */
export function parseTextIntoUnits(rawContent: string): SentenceUnit[] {
  if (!rawContent || !rawContent.trim()) return [];

  // Normalize Windows/Mac line breaks to \n
  const normalized = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawParagraphs = normalized.split('\n');

  const units: SentenceUnit[] = [];
  let prevWasEmpty = false;
  let unitIndex = 0;

  for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
    const rawP = rawParagraphs[pIdx];
    const trimmedP = rawP.trim();

    if (!trimmedP) {
      // Empty line - indicates a spacing / gap between paragraphs
      prevWasEmpty = true;
      continue;
    }

    const hasEmptyLineBefore = prevWasEmpty || (pIdx > 0 && units.length > 0 && prevWasEmpty);
    prevWasEmpty = false;

    // Check if paragraph starts with a bullet glyph or list marker
    const bulletMatch = trimmedP.match(/^([*•\-–—✓✔~►▸→■□○●]|\d+[\.\)])\s*(.*)/);
    const isBullet = !!bulletMatch;
    const bulletGlyph = bulletMatch ? bulletMatch[1] : undefined;
    const textAfterBullet = bulletMatch ? bulletMatch[2] : trimmedP;

    // If it's a bullet item or a single short clause, treat as 1 unit or split if multiple sentences
    const sentences = splitSentences(textAfterBullet);

    if (sentences.length === 0) {
      units.push({
        id: `unit-${unitIndex++}`,
        text: trimmedP,
        isNewParagraph: true,
        hasEmptyLineBefore,
        isBullet,
        bulletGlyph,
      });
      continue;
    }

    sentences.forEach((sent, sIdx) => {
      const isFirstOfParagraph = sIdx === 0;
      let displayText = sent;

      // For bullet items, attach bullet glyph to the first sentence
      if (isBullet && isFirstOfParagraph) {
        displayText = `${bulletGlyph} ${sent}`;
      }

      units.push({
        id: `unit-${unitIndex++}`,
        text: displayText,
        isNewParagraph: isFirstOfParagraph,
        hasEmptyLineBefore: isFirstOfParagraph && hasEmptyLineBefore,
        isBullet: isBullet && isFirstOfParagraph,
        bulletGlyph: isFirstOfParagraph ? bulletGlyph : undefined,
      });
    });
  }

  return units;
}

/**
 * Splits a paragraph string into sentences while preserving acronyms, decimals, and abbreviations.
 */
export function splitSentences(text: string): string[] {
  if (!text || !text.trim()) return [];

  // Replace common Spanish abbreviations temporarily to avoid false splits
  let protectedText = text
    .replace(/(\b(?:Sr|Sra|Dr|Dra|Prof|Lic|Ing|etc|ej|vs|pág|EE\.UU|art)\.)\s/gi, '$1___SPACE___')
    .replace(/(\d+)\.(\d+)/g, '$1___DOT___$2'); // decimal numbers like 3.5

  // Match sentences ending with . ! ? or trailing text
  const rawParts = protectedText.split(/([.!?]+(?:\s+|$))/);
  const sentences: string[] = [];
  let current = '';

  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i];
    current += part;
    if (/[.!?]+(?:\s+|$)/.test(part) || i === rawParts.length - 1) {
      const restored = current
        .replace(/___SPACE___/g, ' ')
        .replace(/___DOT___/g, '.')
        .trim();
      if (restored) {
        sentences.push(restored);
      }
      current = '';
    }
  }

  if (sentences.length === 0 && text.trim()) {
    return [text.trim()];
  }

  return sentences;
}
