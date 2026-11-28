// End-to-end tests in a real Chrome. Run with `npm run test:e2e`.
// Uses the installed Google Chrome (preinstalled on GitHub's Ubuntu runners), or CHROME_PATH.
// Google Fonts is stubbed so tests never wait on the network, and the demo runs on a fake clock.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serve } from '../../scripts/serve.mjs';

let server;
let browser;
let url;

before(async () => {
  server = await serve(0);
  url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
  );
});

after(async () => {
  await browser?.close();
  server?.close();
});

/**
 * Stand-in for the claude.ai runtime, installed before the page loads.
 * `sample` answers from canned replies, streams them, records prompts, and waits for
 * window.__release() when `gated` is set, so tests control exactly when a reply lands.
 * `dictation` is a scriptable fake driven from the test through window.__mic.
 */
function installFakeClaude({ replies, gated = false, failWith = null, withMic = false }) {
  window.__prompts = [];
  let release;
  window.__gate = new Promise((resolve) => (release = resolve));
  window.__release = () => release();

  const sample = async (prompt, { onText } = {}) => {
    window.__prompts.push(prompt);
    if (failWith) throw { code: failWith };
    if (gated) await window.__gate;
    const key = Object.keys(replies).find((k) => prompt.includes(`"""${k}"""`));
    const text = JSON.stringify({ romanization: '', note: '', ...replies[key] });
    for (let i = 8; i <= text.length; i += 8) onText?.({ text: text.slice(0, i) });
    return { text: '```json\n' + text + '\n```' };
  };

  const handlers = {};
  const dictation = {
    onPartial: (fn) => (handlers.partial = fn),
    onFinal: (fn) => (handlers.final = fn),
    onState: (fn) => (handlers.state = fn),
    start: async () => handlers.state({ state: 'listening' }),
    stop: async () => handlers.state({ state: 'idle', reason: 'stopped' }),
  };
  window.__mic = handlers;

  window.claude = {
    use: async (name) => (name === 'sample' ? sample : name === 'dictation' && withMic ? dictation : null),
  };
}

const REPLIES = {
  '야, 오랜만이야!': { target: 'en', register: 'informal', translation: 'Hey, long time no see!' },
  'Thanks!': { target: 'ko', translation: '고마워!', romanization: 'Gomawo!' },
  '<b>hi</b>': { target: 'ko', translation: '<img src=x onerror="window.__xss=1">안녕' },
};

async function openPage({ width = 1280, height = 800, claude = null, fakeClock = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '' }));
  if (fakeClock) await page.clock.install();
  if (claude) await page.addInitScript(installFakeClaude, claude);
  await page.goto(url);
  return { page, errors };
}

async function playWholeDemo(page) {
  await page.clock.runFor(60_000);
  await page.waitForFunction(() => document.querySelector('#demo').textContent === 'Watch demo');
}

test('without Claude the page plays the sample conversation, then restores the pair', async () => {
  const { page, errors } = await openPage({ fakeClock: true });
  await page.clock.runFor(10_000);
  assert.equal(await page.textContent('#demo'), 'Stop demo');
  assert.match(await page.textContent('#log'), /Sample conversation/);
  await playWholeDemo(page);
  const pressed = await page.getAttribute('[data-action="pair"][aria-pressed="true"]', 'data-value');
  assert.equal(pressed, 'koen', 'the demo ends in esko but must hand back the saved pair');
  const saved = await page.evaluate(() => localStorage.getItem('puente.entries'));
  assert.ok(saved === null || JSON.parse(saved).length === 0, 'sample lines are never saved');
  assert.deepEqual(errors, []);
  await page.close();
});

test('stopping the demo restores the pair at once', async () => {
  const { page } = await openPage({ fakeClock: true });
  await page.clock.runFor(20_000); // into the Spanish part of the script
  await page.click('#demo');
  assert.equal(await page.textContent('#demo'), 'Watch demo');
  assert.equal(await page.getAttribute('[data-action="pair"][aria-pressed="true"]', 'data-value'), 'koen');
  await page.close();
});

test('a message sent during a translation waits, then replies in the level that was heard', async () => {
  const { page, errors } = await openPage({ claude: { replies: REPLIES, gated: true } });
  await page.fill('#A input', '야, 오랜만이야!');
  await page.press('#A input', 'Enter');
  await page.fill('#B input', 'Thanks!');
  await page.press('#B input', 'Enter');
  assert.match(await page.textContent('#status'), /1 more waiting/);
  assert.equal(await page.evaluate(() => window.__prompts.length), 1, 'second message is queued, not sent');

  await page.evaluate(() => window.__release());
  await page.waitForFunction(() => document.querySelectorAll('#log li').length === 2);
  const prompts = await page.evaluate(() => window.__prompts);
  assert.match(prompts[0], /default to 해요체/, 'before hearing the Korean speaker, default to 존댓말');
  assert.match(prompts[1], /반말 in 해체/, 'after hearing 반말, reply in 반말');
  assert.equal(await page.textContent('#A .big'), '고마워!');
  assert.match(await page.textContent('#A .regnote'), /they speak 반말/);
  assert.match(await page.textContent('#log'), /replied in 반말/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('model output is shown as text, never as HTML', async () => {
  const { page } = await openPage({ claude: { replies: REPLIES } });
  await page.fill('#B input', '<b>hi</b>');
  await page.press('#B input', 'Enter');
  await page.waitForSelector('#log li');
  assert.equal(await page.$('#stage img, #log img'), null);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.match(await page.textContent('#A .big'), /<img src=x/);
  await page.close();
});

test('a rate limit shows a clear message and frees the app', async () => {
  const { page } = await openPage({ claude: { replies: REPLIES, failWith: 'rate_limited' } });
  await page.fill('#A input', '야, 오랜만이야!');
  await page.press('#A input', 'Enter');
  await page.waitForFunction(() => /Too many requests/.test(document.querySelector('#status').textContent));
  await page.click('[data-action="pair"][data-value="esko"]');
  assert.equal(await page.getAttribute('[data-action="pair"][aria-pressed="true"]', 'data-value'), 'esko');
  await page.close();
});

test('speaking into the mic translates what was heard', async () => {
  const { page } = await openPage({ claude: { replies: REPLIES, withMic: true } });
  await page.waitForSelector('#A .mic:not([hidden]):not(.assist)');
  await page.click('#A .mic');
  assert.equal(await page.getAttribute('#A .mic', 'aria-pressed'), 'true');
  await page.evaluate(() => window.__mic.partial({ text: '야, 오랜' }));
  assert.equal(await page.textContent('#A .big'), '야, 오랜');
  await page.evaluate(() => window.__mic.final({ text: '야, 오랜만이야!' }));
  await page.click('#A .mic'); // stop
  await page.waitForSelector('#log li');
  assert.equal(await page.textContent('#B .big'), 'Hey, long time no see!');
  await page.close();
});

test("without Claude's mic (an installed app window) the mic points to Windows voice typing", async () => {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  });
  const page = await context.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '' }));
  await page.addInitScript(installFakeClaude, { replies: REPLIES });
  await page.goto(url);
  await page.click('#A .mic.assist');
  assert.match(await page.textContent('#status'), /Windows key \+ H/);
  assert.ok(
    await page.$eval('#A input', (el) => el === document.activeElement),
    'the text box is ready for voice typing',
  );
  await context.close();
});

test('face to face flips one side and Swap changes which one', async () => {
  const { page } = await openPage({ claude: { replies: REPLIES } });
  await page.click('[data-action="face-to-face"]');
  assert.ok(await page.$eval('#A', (el) => el.classList.contains('flip')));
  await page.click('[data-action="swap"]');
  assert.ok(await page.$eval('#B', (el) => el.classList.contains('flip')));
  await page.close();
});

test('no sideways scrolling on a small phone', async () => {
  const { page, errors } = await openPage({ width: 360, height: 740, fakeClock: true });
  await page.clock.runFor(10_000);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.equal(overflow, 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test('the eval panel opens at #eval and asks for Claude when it is missing', async () => {
  const page = await browser.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '' }));
  await page.goto(`${url}#eval`);
  await page.waitForSelector('#eval-run');
  assert.match(await page.textContent('#eval'), /60 hand-written cases/);
  await page.click('#eval-run');
  assert.match(await page.textContent('#eval-status'), /needs Claude/);
  await page.close();
});
