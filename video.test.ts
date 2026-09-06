import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutText } from '../src/utils/textLayout';
import { parseTextIntoUnits } from '../src/utils/textParser';
import { prepareNarration, mapReveals } from '../src/utils/narrationTimeline';
import { SlideData } from '../src/types';

const slide: SlideData = {
  id: 'test', index: 0, duration: 1,
  narrationScript: 'Primera oración. Segunda oración.',
  elements: [{ id: 'body', type: 'TEXT', content: 'Primera oración. Segunda oración.',
    position: { x: 0, y: 0, width: 100, height: 100 } }],
};

test('consecutive sentences do not share a baseline and retain all words', () => {
  const units = parseTextIntoUnits('Primera oración. Segunda oración.\n\nOtro párrafo.');
  const result = layoutText(units, 18, 20, text => text.length);
  assert.equal(result.lines.map(line => line.text).join(' '), 'Primera oración. Segunda oración. Otro párrafo.');
  result.lines.slice(1).forEach((line, i) => assert.ok(line.y >= result.lines[i].y + 20));
  assert.ok(result.height >= result.lines.length * 20);
});

test('unbroken long words stay inside the available width', () => {
  const result = layoutText(parseTextIntoUnits('abcdefghijklmnopqrst'), 5, 10, text => text.length);
  assert.ok(result.lines.every(line => line.text.length <= 5));
  assert.equal(result.lines.map(line => line.text).join(''), 'abcdefghijklmnopqrst');
});

test('audio duration, not character count, determines sentence timing', async () => {
  const durations = [7.3, 1.1];
  const track = await prepareNarration(slide, async () => ({ duration: durations.shift()! }) as AudioBuffer);
  assert.equal(track.segments[0].start, 0.2);
  assert.ok(Math.abs(track.segments[1].start - 7.62) < 1e-9);
  assert.equal(track.reveals.get('body:1'), track.segments[1].start);
  assert.ok(track.duration > track.segments[1].end);
});

test('paraphrased notes never get invented sentence timestamps', () => {
  assert.equal(mapReveals(slide, [{ text: 'Una explicación diferente.', start: 2 }]).size, 0);
});

test('failed synthesis aborts instead of exporting a silent slide', async () => {
  await assert.rejects(prepareNarration(slide, async () => null), /No se pudo generar la voz/);
});

test('cancellation stops preparation before the next TTS call', async () => {
  let calls = 0;
  await assert.rejects(prepareNarration(slide, async () => { calls++; return null; }, () => true), /cancelada/);
  assert.equal(calls, 0);
});
