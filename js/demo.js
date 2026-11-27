// Scripted sample conversation. The player drives the UI through a small interface, so it can be
// tested in Node with a fake UI and no timers, and stopped cleanly at any await point.

import { DEMO_SCRIPT, langOf, otherSide } from './config.js';

const TYPE_SOURCE_MS = 45;
const TYPE_TRANSLATION_MS = 32;
const PAUSE_BEFORE_TRANSLATION_MS = 400;
const PAUSE_AFTER_LINE_MS = 2600;
const PAUSE_AFTER_PAIR_SWITCH_MS = 900;

/**
 * @typedef {object} DemoUI
 * @property {(pair: string) => void} showPair
 * @property {(side: 'A'|'B', text: string, stage: 'speaking'|'translating') => void} showTyping
 * @property {(side: 'A'|'B', text: string, heardRegister?: string) => void} showSource
 * @property {(entry: object) => void} showTranslation
 */

/**
 * Play the script once. Resolves true if it ran to the end, false if `isStopped()` became true.
 * @param {{ui: DemoUI, isStopped: () => boolean, wait?: (ms: number) => Promise<void>,
 *          script?: typeof DEMO_SCRIPT, idPrefix?: string}} options
 */
export async function playDemo({
  ui,
  isStopped,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  script = DEMO_SCRIPT,
  idPrefix = 'sample',
}) {
  const pause = async (ms) => {
    if (isStopped()) return false;
    await wait(ms);
    return !isStopped();
  };
  const typeOut = async (side, text, stage, perChar) => {
    let shown = '';
    for (const ch of text) {
      if (isStopped()) return false;
      shown += ch;
      ui.showTyping(side, shown, stage);
      await wait(perChar);
    }
    return !isStopped();
  };

  let count = 0;
  for (const pair of Object.keys(script)) {
    if (isStopped()) return false;
    ui.showPair(pair);
    if (!(await pause(PAUSE_AFTER_PAIR_SWITCH_MS))) return false;
    for (const line of script[pair]) {
      const targetSide = otherSide(line.side);
      if (!(await typeOut(line.side, line.source, 'speaking', TYPE_SOURCE_MS))) return false;
      ui.showSource(line.side, line.source, line.heardRegister);
      if (!(await pause(PAUSE_BEFORE_TRANSLATION_MS))) return false;
      if (!(await typeOut(targetSide, line.translation, 'translating', TYPE_TRANSLATION_MS))) return false;
      ui.showTranslation({
        id: `${idPrefix}-${count++}`,
        sample: true,
        side: line.side,
        from: langOf(pair, line.side),
        to: langOf(pair, targetSide),
        source: line.source,
        translation: line.translation,
        romanization: line.romanization ?? '',
        note: '',
        formality: line.note,
      });
      if (!(await pause(PAUSE_AFTER_LINE_MS))) return false;
    }
  }
  return true;
}
