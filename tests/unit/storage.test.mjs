import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, loadState, saveEntries } from '../../js/storage.js';

function memoryBacking(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
    dump: () => Object.fromEntries(data),
  };
}

const entry = (over = {}) => ({
  id: '1',
  side: 'A',
  from: 'ko',
  to: 'en',
  source: '안녕',
  translation: 'Hi',
  ...over,
});

test('defaults when nothing is saved', () => {
  const state = loadState(createStore(memoryBacking()));
  assert.equal(state.pair, 'koen');
  assert.equal(state.tone, 'auto');
  assert.equal(state.heardRegister, null);
  assert.equal(state.readAloud, true);
  assert.deepEqual(state.entries, []);
});

test('invalid saved values fall back to defaults instead of breaking the page', () => {
  const backing = memoryBacking({
    'puente.pair': '"xx"',
    'puente.tone': '"loud"',
    'puente.heardRegister': '"rude"',
    'puente.flipSide': '"C"',
    'puente.entries': JSON.stringify([{ from: 'zz' }, 5, null, entry({ to: 'fr' }), entry({ id: 7 })]),
  });
  const state = loadState(createStore(backing));
  assert.equal(state.pair, 'koen');
  assert.equal(state.tone, 'auto');
  assert.equal(state.heardRegister, null);
  assert.equal(state.flipSide, 'A');
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].id, '7');
});

test('unparseable JSON and a throwing backing are tolerated', () => {
  const broken = { getItem: () => '{not json', setItem: () => {} };
  assert.equal(loadState(createStore(broken)).pair, 'koen');
  const throwing = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('full');
    },
  };
  const store = createStore(throwing);
  assert.doesNotThrow(() => store.set('pair', 'esko'));
  assert.equal(loadState(store).pair, 'koen');
  assert.equal(loadState(createStore(null)).pair, 'koen');
});

test('sample (demo) lines are never saved', () => {
  const backing = memoryBacking();
  const store = createStore(backing);
  saveEntries(store, [entry({ id: 'real' }), entry({ id: 'demo', sample: true })]);
  const saved = JSON.parse(backing.dump()['puente.entries']);
  assert.deepEqual(
    saved.map((e) => e.id),
    ['real'],
  );
});
