// Rendering: turns app state into DOM. No event handling and no network here.

import { LANGS, QUICK_PHRASES, langOf } from './config.js';
import { registerStatus } from './formality.js';
import { escapeHtml, truncate } from './html.js';
import { sceneFor } from './scenes.js';

const $ = (id) => document.getElementById(id);

const MIC_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
  '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

/**
 * @param {object} state  shared app state (read only here)
 * @param {{isIOS: boolean, listening: () => ('A'|'B'|null), hasMic: () => boolean}} env
 */
export function createView(state, env) {
  function replayReveal(scene) {
    scene.classList.remove('reveal');
    void scene.offsetWidth; // restart the CSS animation
    scene.classList.add('reveal');
  }

  /** Bring one side forward (its scene animates in) and dim the other; null shows both. */
  function setFocus(side, reveal = false) {
    $('stage').classList.toggle('focus', Boolean(side));
    for (const s of ['A', 'B']) $(s).classList.toggle('active', !side || s === side);
    if (side && reveal) replayReveal($(side).querySelector('.scene'));
  }

  function renderScene(side) {
    const lang = langOf(state.pair, side);
    const scene = $(side).querySelector('.scene');
    if (scene.dataset.lang === lang) return;
    scene.dataset.lang = lang;
    scene.innerHTML = sceneFor(lang, side + lang);
    replayReveal(scene);
  }

  function liveMarkup(side) {
    if (state.live.side === side) {
      return `<p class="big partial">${escapeHtml(state.live.text) || '…'}</p>`;
    }
    const shown = state.latest[side];
    if (shown) {
      const roman = shown.romanization
        ? `<p class="rom" lang="ko-Latn">${escapeHtml(shown.romanization)}</p>`
        : '';
      return `<p class="big">${escapeHtml(shown.text)}</p>${roman}`;
    }
    const lang = LANGS[langOf(state.pair, side)];
    return `<p class="hint">${side === 'A' ? 'Person 1' : 'Person 2'} · ${escapeHtml(lang.placeholder)}</p>`;
  }

  const canReplay = (side) => Boolean(state.latest[side]?.entryId) && state.live.side !== side;

  /** Cheap update while text streams in: leaves the text box, focus and Korean IME untouched. */
  function renderLive(side) {
    const root = $(side);
    const live = root.querySelector('.live');
    if (!live) return renderSide(side);
    live.innerHTML = liveMarkup(side);
    const replay = root.querySelector('.say');
    if (replay) replay.hidden = !canReplay(side);
    const mic = root.querySelector('.mic');
    if (mic) {
      const on = env.listening() === side;
      mic.classList.toggle('on', on);
      mic.setAttribute('aria-pressed', String(on));
    }
  }

  function renderSide(side) {
    renderScene(side);
    const code = langOf(state.pair, side);
    const lang = LANGS[code];
    const root = $(side);
    const oldInput = root.querySelector('form.type input');
    const draft = oldInput ? oldInput.value : '';
    const hadFocus = oldInput && document.activeElement === oldInput;
    const listening = env.listening() === side;

    root.classList.toggle('flip', state.flipSide === side);
    const formality =
      code === 'ko'
        ? `<p class="regnote">${escapeHtml(registerStatus(state.tone, state.heardRegister))}</p>`
        : '';
    const quick = QUICK_PHRASES[code]
      .map(
        (phrase, i) =>
          `<button type="button" data-action="quick" data-side="${side}" data-index="${i}">${escapeHtml(phrase)}</button>`,
      )
      .join('');
    const placeholder = !env.hasMic() && env.isIOS ? lang.keyboardMicHint : lang.placeholder;

    root.querySelector('.content').innerHTML = `
      <div class="head">
        <div>
          <p class="across" lang="${code}">↻ ${escapeHtml(lang.facesYou)}</p>
          <h2 class="lang" lang="${code}">${lang.name}</h2>
          <p class="tag">${lang.place}</p>${formality}
        </div>
        <button type="button" class="say" data-action="replay" data-side="${side}" ${canReplay(side) ? '' : 'hidden'}
          aria-label="Play the ${lang.english} translation again">▶ Play</button>
      </div>
      <div class="live" lang="${code}" aria-live="polite">${liveMarkup(side)}</div>
      <div class="quick" role="group" aria-label="Quick phrases in ${lang.english}" lang="${code}">${quick}</div>
      <div class="dock">
        <button type="button" class="mic${listening ? ' on' : ''}" data-action="mic" data-side="${side}"
          aria-label="${lang.speak} (${lang.english})" aria-pressed="${listening}" ${env.hasMic() ? '' : 'hidden'}>${MIC_ICON}</button>
        <form class="type" data-side="${side}">
          <input lang="${code}" aria-label="Type in ${lang.english}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" enterkeyhint="send">
          <button type="submit">${lang.send}</button>
        </form>
      </div>`;

    const input = root.querySelector('form.type input');
    input.value = draft;
    if (hadFocus) input.focus();
  }

  function renderStage() {
    renderSide('A');
    renderSide('B');
    $('stage').classList.toggle('busy', state.busy);
  }

  function renderTranscript() {
    const list = $('log');
    const empty = document.querySelector('.empty');
    if (!state.entries.length) {
      list.innerHTML = '';
      if (!empty) {
        list.insertAdjacentHTML(
          'afterend',
          '<p class="empty">Nothing yet. Tap a mic, a quick phrase, or type a sentence above to start.</p>',
        );
      }
      return;
    }
    empty?.remove();
    list.innerHTML = state.entries
      .slice()
      .reverse()
      .map((e) => {
        const label = escapeHtml(truncate(e.translation, 40));
        const id = escapeHtml(e.id);
        const meta = [
          e.romanization && `<p class="meta" lang="ko-Latn">${escapeHtml(e.romanization)}</p>`,
          e.formality && `<p class="meta">${escapeHtml(e.formality)}</p>`,
          e.note && `<p class="meta">Note: ${escapeHtml(e.note)}</p>`,
          e.sample && '<p class="meta">Sample conversation</p>',
        ]
          .filter(Boolean)
          .join('');
        return `<li>
          <span class="stripe" style="background:var(--${e.side === 'A' ? 'a' : 'b'})"></span>
          <div>
            <p class="src">${LANGS[e.from].name} · <span lang="${e.from}">${escapeHtml(e.source)}</span></p>
            <p class="out" lang="${e.to}">${escapeHtml(e.translation)}</p>${meta}
          </div>
          <div class="acts">
            <button type="button" data-action="play" data-id="${id}" aria-label="Play: ${label}">▶</button>
            <button type="button" data-action="copy" data-id="${id}" aria-label="Copy: ${label}">Copy</button>
            <button type="button" data-action="delete" data-id="${id}" aria-label="Delete: ${label}">✕</button>
          </div>
        </li>`;
      })
      .join('');
  }

  function renderControls() {
    for (const button of document.querySelectorAll('[data-action="pair"]')) {
      button.setAttribute('aria-pressed', String(button.dataset.value === state.pair));
    }
    for (const button of document.querySelectorAll('[data-action="tone"]')) {
      button.setAttribute('aria-pressed', String(button.dataset.value === state.tone));
    }
    const readAloud = $('read-aloud');
    readAloud.setAttribute('aria-pressed', String(state.readAloud));
    readAloud.textContent = `Read aloud: ${state.readAloud ? 'on' : 'off'}`;
    const demo = $('demo');
    demo.textContent = state.demo ? 'Stop demo' : 'Watch demo';
    demo.setAttribute('aria-pressed', String(Boolean(state.demo)));
  }

  return { setFocus, renderLive, renderSide, renderStage, renderTranscript, renderControls };
}
