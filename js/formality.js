// Korean speech-level (register) logic. Pure functions, no DOM.
//
// Korean grammar encodes politeness: 존댓말 (formal/polite) vs 반말 (informal/casual).
// Puente's rule: replies into Korean use the speech level the Korean speaker uses,
// and Korean → Spanish mirrors it (존댓말 → usted, 반말 → tú).
//
// analyzeKorean() is a rule-based reading of sentence endings. It is a heuristic: good on
// everyday spoken lines, blind to context (who is speaking to whom). The app uses it to check
// the model's output and to sanity-check the register the model reports; the eval uses it to
// grade Korean replies.

/** @typedef {'formal' | 'informal'} Register */
/** @typedef {'auto' | 'formal' | 'casual'} ToneSetting */

export const TONE_SETTINGS = Object.freeze(['auto', 'formal', 'casual']);

const KOREAN_LABEL = { formal: '존댓말', informal: '반말' };
const SPANISH_FORM = { formal: 'usted', informal: 'tú' };

/**
 * Speech level to use when translating INTO Korean.
 * A manual setting wins; in auto mode follow what the Korean speaker last used,
 * defaulting to 존댓말, which is the safe choice with someone you have not heard yet.
 * @param {ToneSetting} tone
 * @param {Register | null} lastHeard
 * @returns {Register}
 */
export function koreanReplyRegister(tone, lastHeard) {
  if (tone === 'formal') return 'formal';
  if (tone === 'casual') return 'informal';
  return lastHeard ?? 'formal';
}

/** Normalise a value into a Register or null. */
export function parseRegister(value) {
  return value === 'formal' || value === 'informal' ? value : null;
}

// ---------------------------------------------------------------- rule-based analysis

const HANGUL = /[가-힣]/;
const HANGUL_BASE = 0xac00;
const FINAL_B = 17; // index of the final consonant ㅂ in a Hangul syllable

/** True if the syllable ends in ㅂ (합, 습, 갑, 입 …), which marks 합니다체 endings. */
function endsInB(syllable) {
  const code = (syllable?.charCodeAt(0) ?? 0) - HANGUL_BASE;
  return code >= 0 && code < 11172 && code % 28 === FINAL_B;
}

/** Acknowledgements that carry no speech level on their own. */
const NEUTRAL = new Set(['네', '예', '아', '음', '와', '오']);

/**
 * Declarative -다, the mark of 해라체 written style ("나는 학생이다"): stiff in conversation.
 * Other 해라체 endings are normal casual speech and are not flagged: -자 ("만나자", let's meet),
 * -냐/-니 questions, -구나/-군 exclamations. (The first eval run flagged -자 by mistake.)
 */
const PLAIN_STYLE = /다$/;

function levelOf(sentence) {
  const s = sentence;
  const before = (suffixLength) => s[s.length - suffixLength - 1];
  if (/(요|죠|십시오|소서)$/.test(s)) return 'formal';
  if (/(니다|니까)$/.test(s)) return endsInB(before(2)) ? 'formal' : 'informal'; // 합니다 vs 바쁘니까
  if (/시다$/.test(s)) return endsInB(before(2)) ? 'formal' : 'informal'; // 갑시다 vs 마시다
  return 'informal';
}

/**
 * Read the speech level of a Korean text from its sentence endings.
 * @returns {{register: 'formal'|'informal'|'mixed'|null, plainStyle: boolean}}
 *   register is null when there is no Korean sentence; plainStyle is true when an informal
 *   sentence is in 해라체 (-다/-니/-냐 …) rather than conversational 해체, exclamations excepted.
 */
export function analyzeKorean(text) {
  const sentences = String(text ?? '')
    .split(/(?<=[.!?。！？…])\s+|\n+/)
    .map((raw) => ({
      exclaim: /!\s*$/.test(raw),
      body: raw
        .replace(/\([^)]*\)/g, '') // parentheticals such as (웃음)
        .replace(/[^가-힣]+$/u, '') // trailing punctuation, emoji, Latin, digits
        .trim(),
    }))
    .filter(({ body }) => HANGUL.test(body) && !NEUTRAL.has(body));
  if (!sentences.length) return { register: null, plainStyle: false };

  const levels = sentences.map(({ body }) => levelOf(body));
  const unique = new Set(levels);
  const plainStyle = sentences.some(
    ({ body, exclaim }, i) => levels[i] === 'informal' && !exclaim && PLAIN_STYLE.test(body),
  );
  return { register: unique.size === 1 ? levels[0] : 'mixed', plainStyle };
}

/** Shorthand: just the register from analyzeKorean. */
export const koreanRegisterOf = (text) => analyzeKorean(text).register;

/**
 * Speech level heard from the Korean speaker. The model's label is used when the sentence
 * endings agree or cannot decide; when they clearly disagree the endings win, so a message
 * cannot talk the app into a different register.
 * @param {Register | null} modelLabel
 * @param {string} koreanText
 * @returns {Register | null}
 */
export function resolveHeardRegister(modelLabel, koreanText) {
  const byRule = koreanRegisterOf(koreanText);
  if (byRule === 'formal' || byRule === 'informal') return byRule;
  return modelLabel;
}

// ---------------------------------------------------------------- labels

/** Short status line shown on the Korean side. */
export function registerStatus(tone, lastHeard) {
  const label = KOREAN_LABEL[koreanReplyRegister(tone, lastHeard)];
  if (tone !== 'auto') return `Always ${label}`;
  if (!lastHeard) return 'Auto · 존댓말 until they speak';
  return `Auto · they speak ${label}, so replies use ${label}`;
}

/**
 * Transcript note: what speech level was heard, what was asked for, and, for Korean output,
 * what the reply actually used (checked by rule, not assumed).
 * @param {{from: string, to: string, heard: Register | null, requested: Register,
 *          translation: string}} turn
 */
export function describeTurn({ from, to, heard, requested, translation }) {
  const parts = [];
  if (from === 'ko' && heard) parts.push(`${KOREAN_LABEL[heard]} heard`);
  if (to === 'ko') {
    const actual = koreanRegisterOf(translation);
    if (actual === requested || actual === null) parts.push(`replied in ${KOREAN_LABEL[requested]}`);
    else if (actual === 'mixed') parts.push(`asked for ${KOREAN_LABEL[requested]}, reply mixes levels`);
    else parts.push(`asked for ${KOREAN_LABEL[requested]}, reply used ${KOREAN_LABEL[actual]}`);
  } else if (to === 'es' && from === 'ko' && heard) {
    parts.push(`asked for ${SPANISH_FORM[heard]}`);
  }
  return parts.join(' · ');
}
