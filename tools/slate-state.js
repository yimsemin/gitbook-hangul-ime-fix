// 시험 결과 확인 도구: 커서가 있는 편집기의 모델과 DOM 상태를 한 번에 읽는다.
// 사용: Claude in Chrome의 javascript_tool에 이 파일 내용을 그대로 실행한다. 시험 입력을 보낸 뒤 편집기에 포커스가 있어야 한다.
// 통과 조건: model과 dom이 같고 기대값과 같다. modelCaret과 domCaret(줄 번호, 오프셋)이 같다.
(() => {
  const root = document.activeElement.closest('[data-slate-editor]');
  if (!root) return 'ERROR: 포커스가 편집기에 없음';
  const key = Object.keys(root).find((k) => k.startsWith('__reactFiber'));
  const isEditor = (o) => !!o && typeof o === 'object' && 'isComposing' in o && typeof o.change === 'function';
  let fiber = root[key];
  let editor = null;
  while (fiber && !editor) {
    const props = fiber.memoizedProps || {};
    editor = [props.value, props.editor, props.editorRef && props.editorRef.current].find(isEditor) || null;
    fiber = fiber.return;
  }
  if (!editor) return 'ERROR: 편집기 객체를 찾지 못함';
  const { value } = editor;
  const sel = getSelection();
  const blocks = value.document.nodes.toArray();
  const lines = [...root.children];
  return {
    model: blocks.map((b) => b.text),
    dom: lines.map((l) => l.innerText.replace(/[​﻿\n]/g, '')),
    modelCaret: [blocks.findIndex((b) => b.getDescendant(value.anchorKey)), value.anchorOffset],
    domCaret: [lines.findIndex((l) => l.contains(sel.anchorNode)), sel.anchorOffset],
    composing: editor.isComposing,
  };
})()
