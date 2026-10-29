// ==UserScript==
// @name         GitBook 한글 입력 보정
// @namespace    https://github.com/yimsemin/gitbook-hangul-ime-fix
// @version      0.3.2
// @description  GitBook 편집기(구버전 Slate)가 한글 조합 직후의 스페이스·Enter·커서 이동을 놓치고, 코멘트 입력창에서 조합 중인 글자를 지우는 문제를 보정한다.
// @license      MIT
// @homepageURL  https://github.com/yimsemin/gitbook-hangul-ime-fix
// @supportURL   https://github.com/yimsemin/gitbook-hangul-ime-fix/issues
// @downloadURL  https://raw.githubusercontent.com/yimsemin/gitbook-hangul-ime-fix/main/gitbook-hangul-ime-fix.user.js
// @updateURL    https://raw.githubusercontent.com/yimsemin/gitbook-hangul-ime-fix/main/gitbook-hangul-ime-fix.user.js
// @match        https://app.gitbook.com/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// ==/UserScript==

// 편집기 객체(React fiber 속성)와 Node.prototype을 다루므로 격리된 확장 공간이 아니라 페이지에서 실행해야 한다(@sandbox raw).

(() => {
  'use strict';

  // 편집기는 compositionend 뒤 다음 프레임에야 조합 상태를 풀기 때문에, 그 사이에 온 입력과 커서 이동을 놓친다.
  const STALE_MS = 500;
  const NAV_KEY = /^(Arrow|Home$|End$|Page)/;
  const ZERO_WIDTH = new RegExp(`[${String.fromCharCode(0x200b, 0xfeff)}]`, 'g');
  let composing = false;
  let staleUntil = 0;
  // 커서가 어긋났을 때 믿을 쪽. 'dom': 사용자가 커서를 옮겼다. 'model': 편집기가 글자를 넣었다.
  let trust = null;

  const isStale = () => performance.now() <= staleUntil;

  const editorRoot = (node) => {
    const el = node instanceof Element ? node : node && node.parentElement;
    return el && el.closest('[data-slate-editor]');
  };

  // 편집 영역 DOM의 React fiber를 따라 올라가 가장 가까운 편집기 객체를 찾는다.
  // 코멘트 입력창은 본문 편집기 아래에 붙어 있으므로 먼저 만나는 것이 자기 편집기다.
  const isEditor = (o) => !!o && typeof o === 'object' && 'isComposing' in o && typeof o.change === 'function';
  const findEditor = (node) => {
    const root = editorRoot(node);
    if (!root) return null;
    const key = Object.keys(root).find((k) => k.startsWith('__reactFiber'));
    let fiber = key && root[key];
    let editor = null;
    while (fiber && !editor) {
      const props = fiber.memoizedProps || {};
      editor = [props.value, props.editor, props.editorRef && props.editorRef.current].find(isEditor) || null;
      fiber = fiber.return;
    }
    return editor;
  };

  const releaseStaleComposition = (editor) => {
    if (!composing && editor && editor.isComposing) editor.isComposing = false;
  };

  // DOM 커서를 Slate 좌표(텍스트 노드 키, 오프셋)로 바꾸고 그 텍스트 노드의 DOM 글자를 함께 돌려준다. 텍스트 노드 안이 아니면 null.
  const caretPoint = () => {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed || !sel.anchorNode) return null;
    const leaf = editorRoot(sel.anchorNode) && sel.anchorNode.parentElement.closest('[data-offset-key]');
    const text = leaf && leaf.parentElement.closest('[data-key]');
    if (!text) return null;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return {
      key: text.getAttribute('data-key'),
      offset: range.toString().replace(ZERO_WIDTH, '').length,
      domText: text.textContent.replace(ZERO_WIDTH, ''),
    };
  };

  // 모델 커서와 DOM 커서가 같으면 null.
  // 'text': DOM 글자가 모델보다 늦다(코멘트 입력창은 늦게 다시 그린다). 'caret': 글자는 같고 커서만 다르다.
  const caretMismatch = (editor, point) => {
    const { value } = editor;
    const node = value.document.getDescendant(point.key);
    if (!node || !value.isCollapsed) return null;
    if (value.anchorKey === point.key && value.anchorOffset === point.offset) return null;
    return node.text === point.domText ? 'caret' : 'text';
  };

  // 모델 커서 위치에 DOM 커서를 둔다.
  const placeDomCaret = (editor, root) => {
    const { anchorKey, anchorOffset } = editor.value;
    const text = root.querySelector(`[data-key="${CSS.escape(anchorKey)}"]`);
    if (!text) return;
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    let rest = anchorOffset;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.data.replace(ZERO_WIDTH, '').length;
      if (rest <= length) {
        getSelection().collapse(node, Math.min(rest, node.data.length));
        return;
      }
      rest -= length;
    }
  };

  // 글자는 같은데 커서만 어긋나 있으면 믿을 쪽에 맞춘다.
  const reconcileCaret = () => {
    if (composing || !trust) return;
    const point = caretPoint();
    const root = point && editorRoot(getSelection().anchorNode);
    const editor = root && findEditor(root);
    if (!editor) return;
    releaseStaleComposition(editor);
    if (caretMismatch(editor, point) !== 'caret') return;
    if (trust === 'dom') editor.change((change) => change.collapseTo(point.key, point.offset));
    else placeDomCaret(editor, root);
  };

  // 편집기는 insertText를 DOM 커서 위치에 넣는다. DOM이 늦으면 모델 커서에 직접 넣는다.
  const fixInsertText = (e, editor) => {
    const point = caretPoint();
    const mismatch = point && caretMismatch(editor, point);
    if (mismatch === 'text' || (mismatch === 'caret' && trust === 'model')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      editor.change((change) => change.insertText(e.data));
    } else if (mismatch === 'caret' && trust === 'dom') {
      editor.change((change) => change.collapseTo(point.key, point.offset));
    }
    if (isStale()) trust = 'model';
  };

  // 코멘트 입력창은 조합 도중에 다시 그려지면서 조합 중인 글자를 지운다. 조합 중에는 커서가 있는 텍스트 노드에 쓰지 못하게 한다.
  const nodeValue = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue');
  Object.defineProperty(Node.prototype, 'nodeValue', {
    ...nodeValue,
    set(value) {
      if (composing && this.nodeType === Node.TEXT_NODE && this === getSelection().anchorNode && editorRoot(this)) return;
      nodeValue.set.call(this, value);
    },
  });

  document.addEventListener('compositionstart', () => {
    composing = true;
    trust = null;
  }, true);

  document.addEventListener('compositionend', () => {
    composing = false;
    staleUntil = performance.now() + STALE_MS;
  }, true);

  // 편집기가 조합 노드를 다시 그리면 compositionend 없이 조합이 끊긴다. 조합이 아닌 입력이 오면 조합이 끝난 것으로 본다.
  document.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key !== 'Process') composing = false;
    releaseStaleComposition(findEditor(e.target));
    reconcileCaret();
    if (NAV_KEY.test(e.key) && isStale()) trust = 'dom';
    // 조합 직후 Enter로 줄이 나뉘면 모델 커서는 새 줄로 가지만 DOM 커서는 아직 윗줄이다. 그 낡은 커서가 모델을 되돌리지 못하게 한다.
    if (e.key === 'Enter' && isStale()) trust = 'model';
  }, true);

  document.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertCompositionText') return;
    composing = false;
    const editor = findEditor(e.target);
    if (!editor) return;
    releaseStaleComposition(editor);
    if (e.inputType === 'insertText' && e.data) fixInsertText(e, editor);
  }, true);

  document.addEventListener('mousedown', () => {
    if (composing || isStale()) trust = 'dom';
  }, true);

  document.addEventListener('focusout', () => {
    composing = false;
    trust = null;
  }, true);

  window.addEventListener('selectionchange', (e) => {
    if (composing || !trust) return;
    if (trust === 'dom') {
      // 편집기가 자기 selectionchange 처리를 먼저 하도록 한 틱 늦춘다.
      setTimeout(reconcileCaret, 0);
      return;
    }
    // 편집기가 글자를 넣은 뒤 DOM을 아직 다시 그리지 않았으면 DOM 커서가 낡았다. 편집기가 그 커서를 모델에 반영하지 않게 한다.
    const point = caretPoint();
    const root = point && editorRoot(getSelection().anchorNode);
    const editor = root && findEditor(root);
    const mismatch = editor && caretMismatch(editor, point);
    if (!mismatch) return;
    e.stopImmediatePropagation();
    if (mismatch === 'caret') placeDomCaret(editor, root);
  }, true);
})();
