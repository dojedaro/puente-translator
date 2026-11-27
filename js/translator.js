// One translation turn, independent of the DOM so it can be tested in Node with a fake model.

import { langOf, otherSide } from './config.js';
import { describeTurn, koreanReplyRegister, resolveHeardRegister } from './formality.js';
import { buildPrompt, parseReply, partialTranslation, resolveTurn, sanitizeMessage } from './prompt.js';

export const MODEL_TIER = 'quick';

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * Translate one message.
 * @param {object} args
 * @param {(prompt: string, options: object) => Promise<{text: string}>} args.ask  the `sample` capability
 * @param {string} args.pair
 * @param {'A'|'B'} args.side          side the speaker used
 * @param {string} args.message
 * @param {'auto'|'formal'|'casual'} args.tone
 * @param {'formal'|'informal'|null} args.lastHeard  Korean level heard so far in this conversation
 * @param {(side: 'A'|'B', text: string) => void} [args.onPartial]  streamed translation text
 * @returns {Promise<{entry: object, heard: 'formal'|'informal'|null, turn: object}>}
 */
export async function translateTurn({ ask, pair, side, message, tone, lastHeard, onPartial }) {
  const text = sanitizeMessage(message);
  const requested = koreanReplyRegister(tone, lastHeard);
  const prompt = buildPrompt({
    from: langOf(pair, side),
    to: langOf(pair, otherSide(side)),
    koreanReply: requested,
    message: text,
  });

  const reply = await ask(prompt, {
    modelTier: MODEL_TIER,
    onText: ({ text: streamed }) => {
      const partial = partialTranslation(streamed);
      if (partial !== null) onPartial?.(otherSide(side), partial);
    },
  });

  const parsed = parseReply(reply.text);
  const turn = resolveTurn({ pair, side, target: parsed.target });
  const heard = turn.from === 'ko' ? resolveHeardRegister(parsed.register, text) : null;
  const entry = {
    id: newId(),
    side: turn.sourceSide,
    from: turn.from,
    to: turn.to,
    source: text,
    translation: parsed.translation,
    romanization: parsed.romanization,
    note: parsed.note,
    formality: describeTurn({
      from: turn.from,
      to: turn.to,
      heard,
      requested,
      translation: parsed.translation,
    }),
    sample: false,
  };
  return { entry, heard, turn };
}
