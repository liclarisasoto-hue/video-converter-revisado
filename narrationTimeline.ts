import { SlideData } from '../types';
import { parseTextIntoUnits } from './textParser';

export interface NarrationSegment {
  text: string;
  start: number;
  end: number;
  buffer: AudioBuffer;
}
export interface NarrationTrack {
  segments: NarrationSegment[];
  duration: number;
  reveals: Map<string, number>;
}

const normalize = (text: string) => text.toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const unitKey = (elementId: string, index: number) => `${elementId}:${index}`;

/** Match only literal, complete units. Notes that paraphrase a slide never hide its content. */
export function mapReveals(slide: SlideData, segments: Pick<NarrationSegment, 'text' | 'start'>[]) {
  const reveals = new Map<string, number>();
  for (const element of slide.elements) {
    parseTextIntoUnits(element.content || '').forEach((unit, index) => {
      const needle = normalize(unit.text);
      const matches = segments.filter(segment => normalize(segment.text) === needle);
      if (needle && matches.length === 1) reveals.set(unitKey(element.id, index), matches[0].start);
    });
  }
  return reveals;
}

export async function prepareNarration(
  slide: SlideData,
  load: (text: string) => Promise<AudioBuffer | null>,
  cancelled: () => boolean = () => false,
): Promise<NarrationTrack> {
  const text = slide.narrationScript?.trim() || slide.notes?.trim() ||
    slide.elements.map(element => element.content).filter(Boolean).join('\n');
  const segments: NarrationSegment[] = [];
  let cursor = 0.2;
  // Bounded, sequential requests avoid sending the whole course to TTS at once.
  for (const unit of parseTextIntoUnits(text)) {
    if (cancelled()) throw new Error('Exportación cancelada');
    const buffer = await load(unit.text);
    if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) {
      throw new Error(`No se pudo generar la voz de la diapositiva ${slide.index + 1}. Reintentá la exportación.`);
    }
    segments.push({ text: unit.text, start: cursor, end: cursor + buffer.duration, buffer });
    cursor += buffer.duration + 0.12;
  }
  return { segments, duration: segments.length ? cursor + 0.48 : 0, reveals: mapReveals(slide, segments) };
}
