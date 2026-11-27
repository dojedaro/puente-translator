// Persistence in the viewer's own browser. Everything read back is validated, because
// localStorage can hold values from an older version or be edited by hand.

import { LANGS, PAIRS } from './config.js';
import { TONE_SETTINGS, parseRegister } from './formality.js';

const PREFIX = 'puente.';
const MAX_ENTRIES = 200;

/** Wrap a Storage-like object (localStorage, or a stub in tests); never throws. */
export function createStore(backing) {
  return {
    get(key, fallback) {
      try {
        const raw = backing?.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        backing?.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        // Storage full or blocked (private mode, sandbox): the app keeps working without it.
      }
    },
  };
}

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const isLang = (value) => Object.prototype.hasOwnProperty.call(LANGS, value);

/** Keep only well-formed transcript entries. */
export function sanitizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(
      (e) =>
        e &&
        typeof e === 'object' &&
        isLang(e.from) &&
        isLang(e.to) &&
        typeof e.source === 'string' &&
        typeof e.translation === 'string' &&
        (e.side === 'A' || e.side === 'B'),
    )
    .slice(-MAX_ENTRIES)
    .map((e) => ({
      id: String(e.id),
      side: e.side,
      from: e.from,
      to: e.to,
      source: e.source,
      translation: e.translation,
      romanization: typeof e.romanization === 'string' ? e.romanization : '',
      note: typeof e.note === 'string' ? e.note : '',
      formality: typeof e.formality === 'string' ? e.formality : '',
      sample: false,
    }));
}

/** Read saved settings and transcript, replacing anything invalid with defaults. */
export function loadState(store) {
  return {
    pair: oneOf(store.get('pair', 'koen'), Object.keys(PAIRS), 'koen'),
    tone: oneOf(store.get('tone', 'auto'), TONE_SETTINGS, 'auto'),
    heardRegister: parseRegister(store.get('heardRegister', null)),
    flipSide: oneOf(store.get('flipSide', 'A'), ['A', 'B'], 'A'),
    readAloud: store.get('readAloud', true) !== false,
    entries: sanitizeEntries(store.get('entries', [])),
  };
}

/** Save the transcript, leaving out sample (demo) lines and capping its length. */
export function saveEntries(store, entries) {
  store.set('entries', entries.filter((e) => !e.sample).slice(-MAX_ENTRIES));
}
