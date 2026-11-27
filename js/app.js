// Puente: app state and event wiring.
//
// Inside claude.ai the page reaches Claude through artifact capabilities
// (window.claude.use): `sample` translates, `dictation` listens, `tts` speaks, `desktop` installs.
// Each may be unavailable; the page then falls back to typing, browser speech, or the demo.

import { LANGS, QUICK_PHRASES, langOf, otherSide } from './config.js';
import { createStore, loadState, saveEntries } from './storage.js';
import { translateTurn } from './translator.js';
import { createSpeaker } from './speech.js';
import { createDictationController } from './dictation.js';
import { playDemo } from './demo.js';
import { createView } from './render.js';

const NIGHT_STARTS = 19; // local hour when the scenes switch to night
const NIGHT_ENDS = 6;
const DEMO_AUTOSTART_MS = 900;

const MESSAGES = {
  needsClaude:
    'Live translation runs when this page is opened on claude.ai. Press "Watch demo" to see how it works.',
  demoOnly: 'This copy plays a sample conversation. Live translation runs inside claude.ai.',
  busy: 'Finish the current message first.',
};

const $ = (id) => document.getElementById(id);
const setStatus = (text) => {
  $('status').textContent = text || '';
};

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- state

const store = createStore(safeLocalStorage());
const saved = loadState(store);

const state = {
  pair: saved.pair,
  tone: saved.tone,
  heardRegister: saved.heardRegister, // Korean speech level heard in this conversation
  flipSide: saved.flipSide,
  readAloud: saved.readAloud,
  entries: saved.entries,
  latest: { A: null, B: null }, // what each side shows
  live: { side: null, text: '' }, // text appearing while someone speaks or Claude writes
  busy: false,
  queue: [], // messages sent while a translation was running
  generation: 0, // bumped by Clear and pair switches; late results from older ones are dropped
  demo: null, // { run, snapshot } while the demo plays
  translateFn: null, // the `sample` capability
};

const speaker = createSpeaker({ synth: typeof speechSynthesis === 'undefined' ? null : speechSynthesis });
let dictation = null;

const view = createView(state, {
  isIOS:
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1),
  listening: () => dictation?.listening ?? null,
  hasMic: () => Boolean(dictation),
});

const clearLive = () => {
  state.live = { side: null, text: '' };
};

// ---------------------------------------------------------------- translation

async function translate(rawText, side) {
  const message = String(rawText ?? '').trim();
  if (!message) return;
  if (!state.translateFn) {
    setStatus(MESSAGES.needsClaude);
    return;
  }
  if (state.busy) {
    state.queue.push({ message, side });
    setStatus(`Translating… ${state.queue.length} more waiting.`);
    return;
  }

  const generation = state.generation;
  state.busy = true;
  state.latest[side] = { text: message };
  view.setFocus(side);
  view.renderStage();
  setStatus('Translating…');

  let spoken = null;
  try {
    const { entry, heard, turn } = await translateTurn({
      ask: state.translateFn,
      pair: state.pair,
      side,
      message,
      tone: state.tone,
      lastHeard: state.heardRegister,
      onPartial: (targetSide, text) => {
        if (generation !== state.generation) return;
        state.live = { side: targetSide, text };
        view.renderLive(targetSide);
      },
    });
    if (generation !== state.generation) return; // cleared while waiting

    if (heard) {
      state.heardRegister = heard;
      store.set('heardRegister', heard);
    }
    state.entries.push(entry);
    saveEntries(store, state.entries);
    state.latest[turn.sourceSide] = { text: entry.source };
    state.latest[turn.targetSide] = {
      text: entry.translation,
      romanization: entry.romanization,
      entryId: entry.id,
    };
    view.setFocus(turn.targetSide, true);
    view.renderTranscript();
    setStatus('');
    spoken = entry;
  } catch (error) {
    if (generation === state.generation) setStatus(errorMessage(error));
  } finally {
    state.busy = false;
    clearLive();
    view.renderStage();
  }

  if (spoken && state.readAloud) speaker.speak(spoken.translation, spoken.to);
  const next = state.queue.shift();
  if (next) translate(next.message, next.side);
}

function errorMessage(error) {
  if (error?.code === 'rate_limited') return 'Too many requests. Wait a few seconds and try again.';
  if (error?.code === 'not_granted') return 'Claude access was declined for this page.';
  return 'Could not translate that. Try again.';
}

// ---------------------------------------------------------------- mic

function connectDictation(capability) {
  dictation = createDictationController(capability, {
    onText(side, text) {
      state.live = { side, text };
      view.renderLive(side);
    },
    onDone(side, text) {
      clearLive();
      setStatus('');
      view.renderStage();
      if (text) translate(text, side);
    },
    onError(message) {
      clearLive();
      view.renderStage();
      setStatus(message);
    },
  });
}

function toggleMic(side) {
  if (!dictation) return;
  if (dictation.listening) {
    dictation.stop();
    return;
  }
  if (state.busy) {
    setStatus('Wait for the translation to finish, then speak.');
    return;
  }
  speaker.stop();
  if (!dictation.start(side)) return; // start() must run inside the click, before any await
  state.live = { side, text: '' };
  view.setFocus(side, true);
  view.renderStage();
  setStatus('Listening… tap the mic again when you finish.');
}

// ---------------------------------------------------------------- demo

function startDemo() {
  if (state.busy || dictation?.listening) {
    setStatus(MESSAGES.busy);
    return;
  }
  const run = (state.demo?.run ?? 0) + 1;
  state.demo = { run, snapshot: { pair: state.pair, heardRegister: state.heardRegister } };
  state.entries = state.entries.filter((e) => !e.sample);
  view.renderTranscript();
  view.renderControls();

  playDemo({
    isStopped: () => state.demo?.run !== run,
    ui: {
      showPair: (pair) => switchPair(pair, { persist: false }),
      showTyping(side, text, stage) {
        if (state.live.side !== side) view.setFocus(side, true);
        state.live = { side, text };
        setStatus(
          stage === 'speaking'
            ? 'Sample conversation · someone is speaking'
            : 'Sample conversation · translating',
        );
        view.renderLive(side);
      },
      showSource(side, text, heardRegister) {
        clearLive();
        state.latest[side] = { text };
        if (heardRegister) state.heardRegister = heardRegister;
        view.renderStage();
      },
      showTranslation(entry) {
        clearLive();
        state.entries.push(entry); // kept in memory only: saveEntries drops sample lines
        state.latest[otherSide(entry.side)] = {
          text: entry.translation,
          romanization: entry.romanization,
          entryId: entry.id,
        };
        view.renderStage();
        view.renderTranscript();
      },
    },
  }).then((finished) => {
    if (finished && state.demo?.run === run) {
      stopDemo(state.translateFn ? 'Demo finished.' : `Demo finished. ${MESSAGES.demoOnly}`);
    }
  });
}

/**
 * Stop the demo and put back what it changed: the language pair and the Korean level heard.
 * The sample lines stay in the transcript, marked as samples; they are never saved.
 */
function stopDemo(message = '') {
  if (!state.demo) return;
  const { snapshot } = state.demo;
  state.demo = null;
  clearLive();
  switchPair(snapshot.pair, { persist: false });
  state.heardRegister = snapshot.heardRegister;
  view.renderControls();
  view.renderStage();
  setStatus(message);
}

// ---------------------------------------------------------------- actions

function switchPair(pair, { persist = true } = {}) {
  state.pair = pair;
  state.latest = { A: null, B: null };
  state.heardRegister = null;
  state.generation++;
  if (persist) {
    store.set('pair', pair);
    store.set('heardRegister', null);
  }
  view.setFocus(null);
  view.renderControls();
  view.renderStage();
}

function copyText(text, done) {
  if (!navigator.clipboard) {
    setStatus('Copy is not available here. Select the text instead.');
    return;
  }
  navigator.clipboard.writeText(text).then(
    () => setStatus(done),
    () => setStatus('Copy was blocked. Select the text instead.'),
  );
}

const findEntry = (id) => state.entries.find((e) => e.id === id);
const facingMessage = () =>
  `The ${LANGS[langOf(state.pair, state.flipSide)].english} side now faces the person across from you.`;

/** Handlers for [data-action] buttons. Each receives the button's dataset and the button. */
const actions = {
  demo: () => (state.demo ? stopDemo('Demo stopped.') : startDemo()),
  pair: ({ value }) => {
    if (state.busy || dictation?.listening) {
      setStatus(MESSAGES.busy);
      return;
    }
    stopDemo();
    switchPair(value);
  },
  tone: ({ value }) => {
    state.tone = value;
    store.set('tone', value);
    view.renderControls();
    view.renderStage();
  },
  'read-aloud': () => {
    state.readAloud = !state.readAloud;
    store.set('readAloud', state.readAloud);
    if (!state.readAloud) speaker.stop();
    view.renderControls();
  },
  'face-to-face': (_, button) => {
    const on = document.body.classList.toggle('f2f');
    button.setAttribute('aria-pressed', String(on));
    button.textContent = `Face to face: ${on ? 'on' : 'off'}`;
    setStatus(on ? facingMessage() : '');
  },
  swap: () => {
    state.flipSide = otherSide(state.flipSide);
    store.set('flipSide', state.flipSide);
    view.renderStage();
    setStatus(facingMessage());
  },
  quick: ({ side, index }) => {
    stopDemo();
    translate(QUICK_PHRASES[langOf(state.pair, side)][Number(index)], side);
  },
  mic: ({ side }) => {
    stopDemo();
    toggleMic(side);
  },
  replay: ({ side }) => {
    const entry = findEntry(state.latest[side]?.entryId);
    if (entry) speaker.speak(entry.translation, entry.to);
  },
  play: ({ id }) => {
    const entry = findEntry(id);
    if (entry) speaker.speak(entry.translation, entry.to);
  },
  copy: ({ id }) => {
    const entry = findEntry(id);
    if (entry) copyText(entry.translation, 'Copied.');
  },
  delete: ({ id }) => {
    state.entries = state.entries.filter((e) => e.id !== id);
    saveEntries(store, state.entries);
    view.renderTranscript();
  },
  'copy-all': () => {
    const text = state.entries
      .filter((e) => !e.sample)
      .map((e) => `${LANGS[e.from].english}: ${e.source}\n${LANGS[e.to].english}: ${e.translation}`)
      .join('\n\n');
    if (text) copyText(text, 'Transcript copied.');
    else setStatus('Nothing to copy yet.');
  },
  clear: () => {
    stopDemo();
    state.generation++;
    state.queue = [];
    state.entries = [];
    state.heardRegister = null;
    state.latest = { A: null, B: null };
    saveEntries(store, state.entries);
    store.set('heardRegister', null);
    view.renderTranscript();
    view.renderStage();
    setStatus('Transcript cleared.');
  },
};

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  const handler = button && actions[button.dataset.action];
  if (handler) handler(button.dataset, button);
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form.type');
  if (!form) return;
  event.preventDefault();
  stopDemo();
  const input = form.querySelector('input');
  const text = input.value;
  if (!text.trim()) return;
  input.value = '';
  translate(text, form.dataset.side);
});

// iOS only allows speech that was first started inside a tap.
document.addEventListener('pointerdown', () => speaker.unlock(), { once: true });

// ---------------------------------------------------------------- start

function useCapability(name) {
  return Promise.resolve()
    .then(() => window.claude.use(name))
    .catch(() => null);
}

function connectClaude() {
  useCapability('sample').then((translateFn) => {
    state.translateFn = translateFn;
    if (!translateFn) setStatus(MESSAGES.needsClaude);
  });
  useCapability('tts').then((tts) => speaker.setClaudeVoice(tts));
  useCapability('dictation').then((capability) => {
    if (!capability) return;
    try {
      connectDictation(capability);
    } catch {
      dictation = null;
    }
    view.renderStage();
  });
  useCapability('desktop').then(async (desktop) => {
    try {
      if (desktop?.install && (await desktop.install.state()) === 'available') {
        const button = $('install');
        button.hidden = false;
        button.addEventListener('click', () =>
          Promise.resolve()
            .then(() => desktop.install.request())
            .catch(() => {}),
        );
      }
    } catch {
      // Installing is optional.
    }
  });
}

/** The eval panel lives at #eval and loads its code only when opened. */
function showEvalIfRequested() {
  const panel = $('eval');
  panel.hidden = location.hash !== '#eval';
  if (panel.hidden) return;
  if (!panel.dataset.mounted) {
    panel.dataset.mounted = 'true';
    import('./eval.js').then(({ mountEval }) => mountEval(panel, () => state.translateFn));
  }
  panel.scrollIntoView({ block: 'start' });
}

const hour = new Date().getHours();
if (hour >= NIGHT_STARTS || hour < NIGHT_ENDS) $('stage').classList.add('night');
view.renderControls();
view.renderStage();
view.renderTranscript();
window.addEventListener('hashchange', showEvalIfRequested);
showEvalIfRequested();

if (window.claude?.use) {
  connectClaude();
} else {
  setStatus(MESSAGES.demoOnly);
  if (location.hash !== '#eval') setTimeout(startDemo, DEMO_AUTOSTART_MS);
}
