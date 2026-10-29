# gitbook-hangul-ime-fix

GitBook 편집기에서 한글 IME로 입력할 때 생기는 글자 깨짐을 우회하는 유저스크립트입니다. 스크립트는 [gitbook-hangul-ime-fix.user.js](gitbook-hangul-ime-fix.user.js) 파일 하나입니다.

## 해결할 문제

GitBook 편집기(`app.gitbook.com`)에서 사람이 한글 IME로 입력하면 아래 증상이 나타납니다. 변경 요청 편집 화면의 본문과 블록 코멘트 입력창에서 모두 나타납니다.

| 위치 | 조건 | 증상 |
|---|---|---|
| 본문 | 줄 중간·앞쪽에서 "단어 단어 "처럼 스페이스가 든 한글 입력 | 스페이스가 사라지거나("바 사 " → "바사 ") 글자가 엉뚱한 위치에 들어감 |
| 코멘트 입력창 | 한글 입력, 입력 후 커서를 앞으로 옮겨 추가 입력 | 글자가 낱자로 깨지고("요" → "ㅛ"), 순서와 스페이스가 뒤섞임 |

- 확장 프로그램 끄기, 맞춤법 검사 끄기, 이전 버전 Microsoft IME, 다른 브라우저, 화상 키보드로는 해결되지 않습니다(제작자 확인).
- 원인은 GitBook 편집기(구버전 Slate)에 있습니다. 조합이 끝난 뒤에도 편집기가 잠깐 조합 중으로 여겨 스페이스·Enter·커서 이동을 놓치고, 코멘트 입력창은 늦게 다시 그리면서 조합 중인 글자를 지웁니다. 원인별 근거는 [docs/attempts.md](docs/attempts.md)에 있습니다.

## 목표와 범위

- 목표: 본문과 코멘트 입력창에서 한글 입력이 입력한 그대로, 커서 위치에 들어가게 합니다.
- 범위: `https://app.gitbook.com/*`의 본문과 코멘트 입력창입니다. 다른 사이트, GitBook 공개 문서 화면, 일본어·중국어 IME는 다루지 않습니다.
- 형태: 유저스크립트 파일 1개입니다. Chrome과 Firefox의 Tampermonkey·Violentmonkey에서 같은 파일로 동작하는 것이 목표이며, 현재 확인한 환경은 Windows 11, Chrome, Tampermonkey, Microsoft 한글 IME입니다.

## 동작 방식

OS 한글 IME는 그대로 쓰고, 페이지에서 편집기 객체를 찾아 내부 상태를 보정합니다.

- 조합이 끝났는데 편집기가 아직 조합 중으로 여기면 그 상태를 풀어, 스페이스·Enter를 편집기가 처리하게 합니다.
- 조합 직후 커서를 옮기면 편집기의 커서를 화면 커서에 맞춥니다.
- 코멘트 입력창이 조합 중인 글자를 덮어쓰지 못하게 막고, 화면이 늦게 갱신될 때는 편집기의 커서 위치에 글자를 넣습니다.

GitBook 내부 구조(구버전 Slate, React 내부 속성)에 기대므로 GitBook 업데이트로 동작이 깨질 수 있습니다. 편집기 객체를 찾지 못하면 아무것도 하지 않습니다.

## 사용법

1. Chrome에 [Tampermonkey](https://www.tampermonkey.net/)를 설치합니다. Violentmonkey도 쓸 수 있습니다.
2. Chrome 주소창에 `chrome://extensions`를 열고 Tampermonkey의 "세부정보"에서 "사용자 스크립트 허용"을 켭니다. 꺼져 있으면 Tampermonkey 메뉴에 스크립트가 켜진 것으로 보여도 실행되지 않습니다.
3. **[설치하기](https://raw.githubusercontent.com/yimsemin/gitbook-hangul-ime-fix/main/gitbook-hangul-ime-fix.user.js)** 링크를 열고 Tampermonkey 설치 화면에서 "설치"를 누릅니다.
4. GitBook 편집기 탭을 새로 고칩니다. OS 입력기는 평소처럼 한글로 씁니다.

### 업데이트

이 링크로 설치하면 Tampermonkey가 주기적으로(기본 하루에 한 번) 저장소의 최신 버전을 확인해 자동으로 업데이트합니다. 바로 받으려면 Tampermonkey 대시보드에서 해당 스크립트를 열고 "업데이트 확인"을 누릅니다. 새 버전이 올라온 뒤 반영까지 몇 분 걸릴 수 있습니다.

### 문제 신고

GitBook 화면이 바뀌어 동작이 깨졌거나 다른 환경에서 증상이 나타나면 [Issues](https://github.com/yimsemin/gitbook-hangul-ime-fix/issues)에 사용 환경(운영체제, 브라우저, 한글 입력기)과 증상을 적어 주세요.

## 성공 기준과 결과

실제 IME 입력으로 실행했을 때 입력한 문자열과 결과가 같아야 합니다.

| # | 시나리오 | 기대 결과 | 결과 |
|---|---|---|---|
| 1 | 본문, 줄 끝 입력 | 입력한 그대로 | 통과 |
| 2 | 본문, 줄 중간에 "바 사 " 입력 | 스페이스 2개가 모두 남음 | 통과 |
| 3 | 본문, 조합 중 방향키·Home·클릭으로 커서 이동 | 조합 글자가 깨지지 않고 이동한 위치에 이어서 입력됨 | 통과(클릭은 미시험) |
| 4 | 코멘트 입력창, 입력 후 커서를 앞으로 옮겨 추가 입력 | 새 글자가 커서 위치에 순서대로 들어감 | 통과 |

시험 방법, 대조 결과, 아직 시험하지 않은 경우는 [docs/attempts.md](docs/attempts.md)에 있습니다. Tampermonkey에 설치한 상태에서는 제작자가 직접 입력해 확인했습니다. Firefox·Violentmonkey는 확인하지 않았습니다.

## 구조

```text
gitbook-hangul-ime-fix.user.js   유저스크립트 본체
tools/ime-send-keys.ps1          실제 IME 키 입력을 보내는 시험 도구(Windows 전용)
docs/attempts.md                 원인, 시도별 결과, 시험 방법
```

## 배포와 버전

- 배포는 `main`의 [gitbook-hangul-ime-fix.user.js](gitbook-hangul-ime-fix.user.js) 파일 자체입니다. 헤더의 `@updateURL`·`@downloadURL`이 이 파일을 가리킵니다.
- `main`에 병합한 변경은 곧바로 설치한 모든 사용자에게 업데이트로 전달됩니다. 사용자에게 보낼 변경은 `@version`을 올려야 업데이트가 감지됩니다.
- 병합 전에 [docs/attempts.md](docs/attempts.md)의 시험 방법으로 위 성공 기준을 다시 확인합니다.

## 라이선스

[MIT](LICENSE)

## 정해야 할 것

1. 시험 도구가 Windows 전용이므로, 저장소의 플랫폼 중립 규칙의 예외로 둘지 정합니다.
2. GitBook 지원팀용 영문 제보문을 `docs/`에 둘지 정합니다.
