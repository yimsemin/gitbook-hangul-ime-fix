// ==UserScript==
// @name         GitBook 한글 입력기 (자체 조합)
// @namespace    https://github.com/yimsemin/gitbook-hangul-ime-fix
// @version      0.2.0
// @description  GitBook 편집기에서 OS 한글 IME 대신 두벌식 조합을 직접 처리해 글자 깨짐을 피한다. OS 입력기는 영문 상태로 둔다.
// @match        https://app.gitbook.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
  const KEYS = {
    r: 'ㄱ', s: 'ㄴ', e: 'ㄷ', f: 'ㄹ', a: 'ㅁ', q: 'ㅂ', t: 'ㅅ', d: 'ㅇ', w: 'ㅈ', c: 'ㅊ', z: 'ㅋ', x: 'ㅌ', v: 'ㅍ', g: 'ㅎ',
    k: 'ㅏ', o: 'ㅐ', i: 'ㅑ', j: 'ㅓ', p: 'ㅔ', u: 'ㅕ', h: 'ㅗ', y: 'ㅛ', n: 'ㅜ', b: 'ㅠ', m: 'ㅡ', l: 'ㅣ',
  };
  const SHIFT_KEYS = { r: 'ㄲ', e: 'ㄸ', q: 'ㅃ', t: 'ㅆ', w: 'ㅉ', o: 'ㅒ', p: 'ㅖ' };
  const VOWEL_COMBO = { ㅗㅏ: 'ㅘ', ㅗㅐ: 'ㅙ', ㅗㅣ: 'ㅚ', ㅜㅓ: 'ㅝ', ㅜㅔ: 'ㅞ', ㅜㅣ: 'ㅟ', ㅡㅣ: 'ㅢ' };
  const JONG_COMBO = {
    ㄱㅅ: 'ㄳ', ㄴㅈ: 'ㄵ', ㄴㅎ: 'ㄶ', ㄹㄱ: 'ㄺ', ㄹㅁ: 'ㄻ', ㄹㅂ: 'ㄼ', ㄹㅅ: 'ㄽ', ㄹㅌ: 'ㄾ', ㄹㅍ: 'ㄿ', ㄹㅎ: 'ㅀ', ㅂㅅ: 'ㅄ',
  };
  const invert = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
  const VOWEL_SPLIT = invert(VOWEL_COMBO);
  const JONG_SPLIT = invert(JONG_COMBO);

  const empty = () => ({ cho: '', jung: '', jong: '' });
  let state = empty();
  let shown = '';
  let lastCaret = null;

  const compose = ({ cho, jung, jong }) => {
    if (cho && jung) {
      return String.fromCharCode(0xac00 + (CHO.indexOf(cho) * 21 + JUNG.indexOf(jung)) * 28 + JONG.indexOf(jong));
    }
    return cho || jung;
  };

  const readCaret = () => {
    const s = getSelection();
    return s && s.rangeCount && s.isCollapsed ? { node: s.anchorNode, offset: s.anchorOffset } : null;
  };
  const sameCaret = (a, b) => !!a && !!b && a.node === b.node && a.offset === b.offset;

  const commit = () => {
    state = empty();
    shown = '';
    lastCaret = null;
  };

  const render = () => {
    const next = compose(state);
    if (shown) document.execCommand('delete');
    if (next) document.execCommand('insertText', false, next);
    shown = next;
    lastCaret = readCaret();
  };

  const input = (jamo) => {
    if (JUNG.includes(jamo)) {
      if (state.jong) {
        const [keep, moved] = JONG_SPLIT[state.jong] ? [...JONG_SPLIT[state.jong]] : ['', state.jong];
        state.jong = keep;
        render();
        commit();
        state = { cho: moved, jung: jamo, jong: '' };
      } else if (state.jung) {
        const combo = VOWEL_COMBO[state.jung + jamo];
        if (combo) {
          state.jung = combo;
        } else {
          commit();
          state = { cho: '', jung: jamo, jong: '' };
        }
      } else {
        state.jung = jamo;
      }
    } else if (!state.cho && !state.jung) {
      state.cho = jamo;
    } else if (!state.jung || !state.cho) {
      commit();
      state = { cho: jamo, jung: '', jong: '' };
    } else if (!state.jong) {
      if (JONG.includes(jamo)) {
        state.jong = jamo;
      } else {
        commit();
        state = { cho: jamo, jung: '', jong: '' };
      }
    } else if (JONG_COMBO[state.jong + jamo]) {
      state.jong = JONG_COMBO[state.jong + jamo];
    } else {
      commit();
      state = { cho: jamo, jung: '', jong: '' };
    }
    render();
  };

  const backspace = () => {
    if (state.jong) state.jong = JONG_SPLIT[state.jong] ? [...JONG_SPLIT[state.jong]][0] : '';
    else if (state.jung) state.jung = VOWEL_SPLIT[state.jung] ? [...VOWEL_SPLIT[state.jung]][0] : '';
    else state.cho = '';
    render();
    if (!shown) commit();
  };

  const isEditable = (t) => t instanceof Element && t.closest('[contenteditable="true"]');

  document.addEventListener('keydown', (e) => {
    if (!isEditable(e.target)) return;
    if (shown && !sameCaret(readCaret(), lastCaret)) commit();
    const modified = e.ctrlKey || e.altKey || e.metaKey;
    const letter = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : '';
    if (e.isComposing || e.key === 'Process' || modified || !letter) {
      if (e.key === 'Backspace' && shown && !modified) {
        e.preventDefault();
        backspace();
        return;
      }
      if (e.key !== 'Shift') commit();
      return;
    }
    const jamo = (e.shiftKey && SHIFT_KEYS[letter]) || KEYS[letter];
    if (!jamo) return;
    e.preventDefault();
    input(jamo);
  }, true);

  document.addEventListener('mousedown', commit, true);
  document.addEventListener('focusout', commit, true);
})();
