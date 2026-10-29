# 시도 기록

GitBook 편집기에서 한글 IME 입력이 깨지는 문제의 원인, 우회 시도별 결과, 시험 방법, 배포 절차입니다. 같은 시험을 반복하지 않도록 남깁니다. 현재 유저스크립트는 시도 6이며 아래 시험 시나리오를 모두 통과합니다.

## 환경

- Windows 11, Chrome(최신), Microsoft 한글 IME, Tampermonkey.
- 시험 대상: GitBook 변경 요청(초안) 안의 시험 전용 페이지 "IMETEST". 발행·병합하지 않습니다. 이전 시험의 글자가 남은 페이지는 쓰지 않습니다.

## 시험 방법

사람의 입력 경로를 재현하려면 실제 IME를 거쳐야 합니다. 확장이 `insertText` 이벤트로 완성된 글자를 넣는 방식은 증상이 나타나지 않아 검증에 쓸 수 없습니다.

- 키 입력 도구: [tools/ime-send-keys.ps1](../tools/ime-send-keys.ps1)이 Windows `keybd_event`로 Chrome 창에 가상 키를 보냅니다. 두벌식 자판 영문 키(`r`=ㄱ, `k`=ㅏ)를 보내면 IME가 `insertCompositionText` 이벤트를 만들어 냅니다.
- 스크립트 적용: 시험 탭을 새로 고친 뒤 Claude in Chrome의 `javascript_tool`로 유저스크립트 본문을 그대로 실행했습니다. 대조군은 새로 고친 직후 스크립트 없이 실행했습니다.
- 결과 확인: [tools/slate-state.js](../tools/slate-state.js)를 `javascript_tool`로 실행해 편집기 모델 줄, DOM 줄, 두 커서 위치를 함께 읽습니다. 모델과 DOM이 같고 기대값과 같으며 두 커서가 같아야 통과입니다.

| 위치 | 보낸 키 | 기대 결과 |
|---|---|---|
| 본문 | `{END}{ENTER}rksk ekfk akqk{HOME}{RIGHT}{RIGHT}{RIGHT}qk tk dk{HOME}wk{END}rk{ENTER}sk{END}` | 새 줄 `자가나 바 사 아다라 마바가`, 다음 줄 `나` |
| 코멘트 입력창(빈 상태에서) | `rksk ekfk akqk{HOME}{RIGHT}{RIGHT}{RIGHT}qk tk ` | `가나 바 사 다라 마바` |
| 코멘트 입력창(빈 상태에서) | `rk{SHIFTENTER}sk{SHIFTENTER}ek fk{SHIFTENTER}ak` | 줄 `가` `나` `다 라` `마`. 커서는 마지막 줄 |

본문 시나리오에는 줄 끝 입력, 줄 중간 스페이스, 조합 중 `Home`, 조합 직후 Enter가 들어 있습니다. 코멘트 입력창에서는 Enter를 보내지 않습니다(제출될 수 있음).

주의할 점
- 키는 대상 창의 활성 탭으로 갑니다. 시험 탭이 사용자 창의 백그라운드 탭이면 사용자의 탭에 입력됩니다. 시험 탭(Claude 탭 그룹)을 별도 창으로 옮기고, 보내기 전에 Chrome 창 제목 목록에서 시험 페이지 제목이 1개인지 확인합니다. 도구도 창 제목이 정확히 1개일 때만 보냅니다. 시험 중에는 사용자가 그 창을 쓰지 않아야 합니다.
- `keybd_event`에 스캔 코드를 주지 않으면 `KeyboardEvent.code`가 빈 값입니다. 현재 도구는 `MapVirtualKey`로 스캔 코드를 채웁니다. `{HOME}` `{END}`는 `code`가 `Numpad7` `Numpad1`로 보입니다(확장 키 플래그 없음).
- `{HANGUL}`(VK_HANGUL)은 IME 한/영 상태를 전환합니다. 두 번 보내면 원래 상태로 돌아옵니다.
- 설치한 스크립트가 페이지에 적용됐는지는 페이지에서 `String(Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue').set).includes('composing')`가 `true`인지로 확인합니다. Tampermonkey의 "사용자 스크립트 허용"이 꺼져 있으면 `false`입니다.
- 코멘트 입력창의 내용은 초안으로 남아 새로 고쳐도 유지됩니다. 블록 옆 `draft` 표시를 눌러 열고 `Ctrl+A`, `Backspace`로 비운 뒤 모델 텍스트가 빈 문자열인지 확인하고 시작합니다. 이전 시험으로 모델과 DOM이 어긋난 상태에서 시작하면 결과를 판정할 수 없습니다.

## 확인한 원인

편집기는 GitBook이 고친 구버전 Slate(0.3x 계열, Immutable.js 기반)입니다. 편집 영역에 `data-slate-editor`·`data-key`·`data-document-key` 속성이 있고, value 객체에 `anchorKey`·`anchorOffset`·`change()`가 있습니다. 본문과 코멘트 입력창은 각각 별도의 Slate 편집기입니다.

편집기 객체는 편집 영역 DOM의 React fiber를 위로 따라가며 `isComposing`과 `change`를 가진 첫 객체(Context Provider의 `value`, `editor` 속성, `editorRef.current` 중 하나)로 찾습니다. 코멘트 입력창은 React 트리에서 본문 편집기 아래에 있으므로, `editorRef`만 찾으면 본문 편집기가 잡힙니다.

1. **조합 상태 해제 지연(본문·코멘트)**: `compositionend` 후 편집기의 `isComposing`이 다음 프레임까지 `true`로 남습니다. 그 사이에 온 스페이스 `beforeinput`은 편집기가 무시해 DOM에만 들어가고 모델에는 빠집니다(DOM `가나 바 다라`, 모델 `가나 바다라`). 조합 직후 Enter `keydown`도 같은 이유로 사라집니다.
2. **커서 이동 누락(본문·코멘트)**: 조합 직후 `Home` 같은 커서 이동은 DOM에서만 일어나고 모델 커서는 그대로입니다. 편집기에 따로 있는 조합 플래그 때문으로 추정합니다(편집기 소스는 확인하지 않음). 이어서 입력한 글자는 옛 모델 위치로 들어갑니다. 조합이 없을 때 DOM 커서를 옮기면 모델은 50ms 안에 따라옵니다.
3. **늦은 다시 그리기(코멘트)**: 코멘트 입력창은 모델이 바뀐 뒤 별도 작업(약 5~15ms 뒤)에서 DOM을 다시 그립니다. 한글은 앞 음절의 `compositionend`와 다음 음절의 `compositionstart`가 같은 틱에 오므로, 다시 그리기가 이미 시작된 다음 음절의 조합 노드를 덮어씁니다. 덮어쓰기는 `nodeValue` 변경이거나, 빈 줄의 자리표시 노드를 바꾸는 `childList` 교체입니다. 조합이 끊기면 IME는 `compositionend` 없이 그 글자를 `insertText`로 다시 보냅니다.
4. **늦은 DOM을 기준으로 한 입력(코멘트)**: 3 때문에 DOM 글자와 DOM 커서가 모델보다 늦을 때가 있습니다. 편집기는 `insertText`를 DOM 위치에 넣고, 그 사이에 온 `selectionchange`로 모델 커서를 낡은 DOM 커서로 되돌립니다.
5. **조합 직후 줄 나눔 뒤 낡은 커서(코멘트)**: 조합 직후 Shift+Enter로 줄을 나누면 모델 커서는 새 줄로 가는데 DOM 커서는 다시 그리기 전까지 윗줄입니다. 그 사이에 온 `selectionchange`를 편집기가 받아 모델 커서를 윗줄로 되돌립니다. 새 줄은 아래에 생기고 이어서 입력한 글자는 윗줄로 들어갑니다.

기타 관찰
- `beforeinput`의 `insertCompositionText`는 취소할 수 없습니다. 브라우저가 DOM을 먼저 바꿉니다.
- `document.execCommand('insertText'/'delete')`로 글자를 넣고 지우는 방식은 줄 중간에서도 정상입니다.

## 시도별 결과

| # | 방법 | 결과 |
|---|---|---|
| 1 | 조합 직후 DOM 커서를 기록해 두었다가 400ms 동안 `selectionchange`와 `beforeinput`마다 되돌림 | 해결되지 않음. 정상적으로 움직인 커서까지 되돌려 증상이 더 나빠짐 |
| 2 | 위 방식을 조합 직후 첫 `insertText`의 `beforeinput`에서만 1회 적용 | 스페이스가 엉뚱한 위치(`가나 바사다 라 마바`)로 들어감 |
| 3 | `window` 캡처 단계에서 조합 이벤트를 `stopImmediatePropagation`으로 편집기에 전달하지 않음 | 입력한 글자가 모델에 반영되지 않아 화면에서 사라짐 |
| 4 | 조합 직후 `insertText`를 막고 rAF에서 커서를 복구한 뒤 40ms 후 `execCommand('insertText')`로 다시 입력 | 해결되지 않음. 첫 줄까지 스페이스 위치가 틀어짐(`가나다바라사 마바`) |
| 5 | OS IME를 영문으로 두고 스크립트가 두벌식 조합을 직접 처리 | 미완. Enter 직후 조합된 글자가 화면에 나타나지 않음. 시도 6으로 대체 |
| 6 | 편집기 내부 상태를 직접 보정(아래) | 본문·코멘트 시나리오 모두 통과 |

시도 6의 보정 내용([gitbook-hangul-ime-fix.user.js](../gitbook-hangul-ime-fix.user.js))
- 원인 1: 실제 조합이 끝났는데 편집기 `isComposing`이 `true`면, 조합 키가 아닌 `keydown`과 조합이 아닌 `beforeinput`의 캡처 단계에서 `false`로 내립니다.
- 원인 2: `compositionend` 후 500ms 안에 방향키·Home/End·PageUp/Down·마우스로 커서를 옮기면, 다음 `selectionchange` 직후 모델 커서를 DOM 커서로 옮깁니다(`change.collapseTo`).
- 원인 3: 실제 조합 중에는 커서가 있는 편집기 텍스트 노드에 `nodeValue`를 쓰지 못하게 합니다. 조합이 `compositionend` 없이 끊길 수 있으므로, 조합이 아닌 입력이나 포커스 이탈이 오면 조합이 끝난 것으로 봅니다. `childList` 교체로 끊긴 조합은 막지 못하지만, IME가 다시 보내는 `insertText`를 원인 4의 보정이 바른 위치에 넣습니다.
- 원인 4: `insertText`를 받았을 때 DOM 글자가 모델과 다르면 가로채서 모델 커서에 직접 넣습니다. 조합 직후 글자를 넣은 뒤에는 DOM과 모델이 어긋난 `selectionchange`를 편집기에 전달하지 않고, 글자가 같으면 DOM 커서를 모델 위치로 옮깁니다.
- 원인 5: 조합 직후(500ms 안)의 Enter `keydown`에서 모델 커서를 믿는 쪽으로 정해, 낡은 DOM 커서를 편집기에 전달하지 않습니다.

대조 결과(같은 키 입력)

| 위치 | 스크립트 없음 | 시도 6 |
|---|---|---|
| 본문(Enter 시험 제외) | `가나 바사아자다라 마바` | `자가나 바 사 아다라 마바` |
| 코멘트 입력창 | `가 다 마바바라사나` | `가나 바 사 다라 마바` |

## 배포와 버전

- 배포는 `main`의 [gitbook-hangul-ime-fix.user.js](../gitbook-hangul-ime-fix.user.js) 파일 자체입니다. 헤더의 `@updateURL`·`@downloadURL`이 이 파일을 가리킵니다.
- `main`에 병합한 변경은 곧바로 설치한 모든 사용자에게 업데이트로 전달됩니다. 사용자에게 보낼 변경은 `@version`을 올려야 업데이트가 감지됩니다.
- 병합 전에 위 시험 방법으로 [README](../README.md)의 성공 기준을 다시 확인합니다.

## 남은 확인 항목

- 위 시나리오는 페이지에 같은 코드를 직접 실행한 상태로 시험했습니다. Tampermonkey에 설치한 상태(`document-start` 실행)에서는 제작자가 직접 입력해 확인했고, 시험 도구로는 시험하지 않았습니다.
- 조합 중 마우스 클릭으로 커서를 옮기는 경우는 실제 마우스 입력으로 시험하지 않았습니다. 보정 코드는 `mousedown`을 커서 이동으로 처리합니다.
- 굵게·링크 같은 서식이 있는 줄, 목록·표·코드 블록 안 입력은 시험하지 않았습니다.
- 조합 중 Backspace, 빠른 연속 입력(키 간격 70~90ms보다 짧은 경우)은 시험하지 않았습니다.
