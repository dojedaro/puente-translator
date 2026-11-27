import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_SCRIPT } from '../../js/config.js';
import { playDemo } from '../../js/demo.js';
import { pickVoice } from '../../js/speech.js';
import { sceneFor } from '../../js/scenes.js';

function fakeUI() {
  const calls = [];
  return {
    calls,
    ui: {
      showPair: (pair) => calls.push(['pair', pair]),
      showTyping: () => {},
      showSource: (side, text, register) => calls.push(['source', side, text, register]),
      showTranslation: (entry) => calls.push(['translation', entry]),
    },
  };
}

test('the demo plays every scripted line in order', async () => {
  const { ui, calls } = fakeUI();
  const finished = await playDemo({ ui, isStopped: () => false, wait: async () => {} });
  assert.equal(finished, true);
  const translations = calls.filter((c) => c[0] === 'translation').map((c) => c[1]);
  const lines = Object.values(DEMO_SCRIPT).flat();
  assert.equal(translations.length, lines.length);
  assert.ok(translations.every((e) => e.sample === true));
  assert.deepEqual(
    calls.filter((c) => c[0] === 'pair').map((c) => c[1]),
    Object.keys(DEMO_SCRIPT),
  );
});

test('the demo stops at the next step once stopped', async () => {
  const { ui, calls } = fakeUI();
  let steps = 0;
  const finished = await playDemo({
    ui,
    isStopped: () => steps > 40,
    wait: async () => {
      steps++;
    },
  });
  assert.equal(finished, false);
  assert.ok(calls.filter((c) => c[0] === 'translation').length < Object.values(DEMO_SCRIPT).flat().length);
});

test('demo lines follow the formality rules they claim', () => {
  for (const line of Object.values(DEMO_SCRIPT).flat()) {
    if (/replied in usted/.test(line.note)) assert.match(line.translation, /sígame|usted/i);
    if (line.heardRegister === 'informal') assert.doesNotMatch(line.source, /요[.!?]?$|니다[.!?]?$/);
    if (line.heardRegister === 'formal') assert.match(line.source, /요[.!?]?$|니다[.!?]?$/);
  }
});

test('pickVoice prefers the region, then the quality', () => {
  const voices = [
    { lang: 'es-ES', name: 'Mónica' },
    { lang: 'es-MX', name: 'Paulina' },
    { lang: 'es-MX', name: 'Paulina (Enhanced)' },
    { lang: 'en-US', name: 'Samantha' },
  ];
  assert.equal(pickVoice(voices, 'es').name, 'Paulina (Enhanced)');
  assert.equal(pickVoice(voices, 'en').name, 'Samantha');
  assert.equal(pickVoice(voices, 'ko'), null);
  assert.equal(pickVoice([{ lang: 'ko_KR', name: 'Yuna' }], 'ko').name, 'Yuna');
  // Region outranks quality: a Mexican voice beats a premium voice from Spain.
  assert.equal(
    pickVoice(
      [
        { lang: 'es-ES', name: 'Mónica (Premium)' },
        { lang: 'es-MX', name: 'Paulina' },
      ],
      'es',
    ).name,
    'Paulina',
  );
});

test('each language has a scene with unique gradient ids', () => {
  for (const lang of ['ko', 'en', 'es']) {
    const svg = sceneFor(lang, `A${lang}`);
    assert.match(svg, /^<svg /);
    assert.match(svg, /class="stars"/);
    const ids = [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(ids.every((id) => id.startsWith(`A${lang}`)));
    assert.equal(new Set(ids).size, ids.length);
  }
  assert.throws(() => sceneFor('fr', 'x'));
});
