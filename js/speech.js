// Speech output. Prefers the Claude voice (the artifact `tts` capability); falls back to the
// browser's speechSynthesis, which is what iPhone users get.

import { LANGS, VOICE_PREFERENCES } from './config.js';

const SPEECH_RATE = 0.95;

function qualityOf(name) {
  if (/premium/i.test(name)) return 2;
  if (/enhanced|siri|neural|natural/i.test(name)) return 1;
  return 0;
}

/**
 * Choose the best installed voice for a language. Region comes first (es-MX before es-ES,
 * to match the Mexico scene), then quality (Premium, then Enhanced). Pure, so it is unit-tested.
 * @param {{lang: string, name: string}[]} voices
 * @param {string} lang
 */
export function pickVoice(voices, lang) {
  const preferred = VOICE_PREFERENCES[lang] ?? [];
  const rankOf = (tag) => {
    const i = preferred.indexOf(tag);
    return i < 0 ? preferred.length : i; // other regions of the language rank last
  };
  let best = null;
  for (const voice of voices ?? []) {
    const tag = String(voice.lang).replace('_', '-');
    if (!tag.toLowerCase().startsWith(lang)) continue;
    const candidate = { voice, rank: rankOf(tag), quality: qualityOf(voice.name) };
    if (
      !best ||
      candidate.rank < best.rank ||
      (candidate.rank === best.rank && candidate.quality > best.quality)
    ) {
      best = candidate;
    }
  }
  return best?.voice ?? null;
}

/**
 * @param {{tts?: {speak: Function, stop?: Function} | null, synth?: SpeechSynthesis | null}} engines
 */
export function createSpeaker(engines) {
  const state = { tts: engines.tts ?? null, synth: engines.synth ?? null, voices: [] };

  const loadVoices = () => {
    try {
      state.voices = state.synth?.getVoices() ?? [];
    } catch {
      state.voices = [];
    }
  };
  // Chrome fills the voice list asynchronously; iOS has it at once.
  loadVoices();
  state.synth?.addEventListener?.('voiceschanged', loadVoices);

  function speakWithBrowser(text, lang) {
    const { synth } = state;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    if (!state.voices.length) loadVoices();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANGS[lang].speechTag;
    const voice = pickVoice(state.voices, lang);
    if (voice) utterance.voice = voice;
    utterance.rate = SPEECH_RATE;
    synth.cancel();
    synth.speak(utterance);
  }

  return {
    setClaudeVoice(tts) {
      state.tts = tts;
    },
    /**
     * iOS only lets a page speak after speech was started inside a tap. Call this from the
     * first tap so later read-alouds, which happen after a network wait, are allowed.
     */
    unlock() {
      try {
        if (!state.tts && state.synth && typeof SpeechSynthesisUtterance !== 'undefined') {
          state.synth.speak(new SpeechSynthesisUtterance(''));
        }
      } catch {
        // Nothing to unlock.
      }
    },
    /** Speak a translation. Never throws: speech is a nice-to-have, the text is on screen. */
    speak(text, lang) {
      try {
        if (state.tts) {
          Promise.resolve(state.tts.speak(text, { language: lang })).catch(() => {});
        } else {
          speakWithBrowser(text, lang);
        }
      } catch {
        // Ignore: the translation is already shown.
      }
    },
    stop() {
      try {
        state.tts?.stop?.();
        state.synth?.cancel();
      } catch {
        // Ignore.
      }
    },
  };
}
