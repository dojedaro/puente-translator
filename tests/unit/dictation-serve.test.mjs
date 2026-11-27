import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDictationController } from '../../js/dictation.js';
import { resolvePublicPath, serve } from '../../scripts/serve.mjs';

function fakeDictation({ startThrows, stopRejects } = {}) {
  const handlers = {};
  return {
    handlers,
    capability: {
      onPartial: (fn) => (handlers.partial = fn),
      onFinal: (fn) => (handlers.final = fn),
      onState: (fn) => (handlers.state = fn),
      start: () => {
        if (startThrows) throw { code: startThrows };
        return Promise.resolve();
      },
      stop: () => (stopRejects ? Promise.reject(new Error('no')) : Promise.resolve()),
    },
  };
}

function controller(options) {
  const fake = fakeDictation(options);
  const events = [];
  const ctl = createDictationController(fake.capability, {
    onText: (side, text) => events.push(['text', side, text]),
    onDone: (side, text) => events.push(['done', side, text]),
    onError: (message) => events.push(['error', message]),
  });
  return { ctl, events, handlers: fake.handlers };
}

test('dictation: partial and final words, then done on idle', () => {
  const { ctl, events, handlers } = controller();
  ctl.start('A');
  handlers.state({ state: 'listening' });
  handlers.partial({ text: '안녕' });
  handlers.final({ text: '안녕하세요' });
  handlers.partial({ text: '반갑' });
  handlers.state({ state: 'idle', reason: 'stopped' });
  assert.deepEqual(events, [
    ['text', 'A', '안녕'],
    ['text', 'A', '안녕하세요'],
    ['text', 'A', '안녕하세요 반갑'],
    ['done', 'A', '안녕하세요'],
  ]);
  assert.equal(ctl.listening, null);
});

test('dictation: a refused start reports an error and does not stay listening', () => {
  const { ctl, events } = controller({ startThrows: 'not_granted' });
  assert.equal(ctl.start('B'), false);
  assert.equal(ctl.listening, null);
  assert.match(events[0][1], /declined/);
});

test('dictation: a failed stop still ends listening', async () => {
  const { ctl, events, handlers } = controller({ stopRejects: true });
  ctl.start('A');
  handlers.final({ text: '네' });
  ctl.stop();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(ctl.listening, null);
  assert.deepEqual(events.at(-1), ['done', 'A', '네']);
});

test('serve: only public files, no traversal, no crash on bad escapes', () => {
  assert.ok(resolvePublicPath('/index.html'));
  assert.ok(resolvePublicPath('/js/app.js'));
  assert.ok(resolvePublicPath('/'));
  assert.equal(resolvePublicPath('/package.json'), null);
  assert.equal(resolvePublicPath('/.github/workflows/ci.yml'), null);
  assert.equal(resolvePublicPath('/../voice-translator-x/secret'), null);
  assert.equal(resolvePublicPath('/js/../../etc/passwd'), null);
  assert.equal(resolvePublicPath('/%'), null);
});

test('serve: answers 404 to a malformed path and keeps running', async () => {
  const server = await serve(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/%`)).status, 404);
    assert.equal((await fetch(`${base}/index.html`)).status, 200);
  } finally {
    server.close();
  }
});
