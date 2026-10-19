# 검토 2 — 코드 검수

## 요약 (10줄 이내)

1. **높음:** 임시 정리 루트나 상위 경로가 junction이면 사용자 권한의 재귀 삭제가 저장소 밖을 향할 수 있다.
2. **높음:** 프로젝트 설정·Git exclude 쓰기도 실제 경로 검증과 읽기 실패 구분이 없어 외부 파일 또는 기존 내용을 훼손할 수 있다.
3. **높음:** 샌드박스 설정 검사가 TOML의 인용 키·인라인 테이블을 놓치며, 유효 설정 확인에서도 쓰기 범위·네트워크를 검사하지 않는다.
4. **높음:** 무시된 보호 파일과 보호 디렉터리 자체의 링크를 보호 경로 검사가 놓친다.
5. **높음:** 최종 수정 뒤 보정 없는 전체 테스트가 빠지는 기존 검토 지적을 재확인했다.
6. **중간:** 일부 한도 창·외부 도구 목록의 형식 오류와 누락된 세션 기록을 통과 또는 탐지 0건으로 처리한다.
7. **중간:** 정정 턴의 대화 ID 검증이 빠지고, 결과 파일 오류 뒤 성공 기록·검수 안내와 실제 실패 종료가 엇갈린다.
8. **중간:** 공용 임시 폴더의 동시 실행 간섭, 사용량 기록 누락, 하위 토큰 중복·계보 누락이 남는다.
9. 위험 명령 탐지 누락, 권한·훅의 우회 표면, 최신 명세 1~19절 대조, 시험 공백 16항목과 중단 경로를 기록했다.
10. 정적 검토만 수행했으며 코드·테스트 실행 및 대상 저장소 수정은 하지 않았다. 실행에 필요한 확인은 ‘확인 못 함’으로 구분했다.

검토일: 2026-10-12 (한국 시간). 대상: `D:\Work\LLM_Project\LLM_WorkFlow`, HEAD `79b62d8f110fa8012149ca9c880092bda7e06ab6`.

방법: 소스·테스트·스킬·명세의 정적 검토만 수행했다. 프로젝트 코드, 테스트, Codex 호출, 네트워크, 프로세스 종료는 실행하지 않았다. 이 보고서 외 파일을 수정하지 않았다. 아래 경로는 별도 표시가 없으면 대상 저장소 기준이며, `파일:줄`은 현재 읽은 파일의 줄 번호다. 정적 입력 사례는 실행 재현 결과가 아니다. 설치된 외부 플러그인의 실제 동작, 훅 활성 여부, 실제 사고 발생은 **확인 못 함**이다. 기존 검토 1과 겹치거나 이미 보류된 항목은 따로 표시한다.

## 1. 안전

### S1. 임시 정리 루트의 링크를 따라 저장소 밖을 삭제할 수 있음

- **심각도:** 높음.
- **위치:** `plugin/scripts/lib/temp-cleanup.mjs:6–18`, `plugin/scripts/lib/project-config.mjs:8`, `plugin/scripts/codex-run.mjs:174,250`, `plugin/scripts/lib/run.mjs:235–238`.
- **문제:** `emptyDir`은 `existsSync`와 `readdirSync`로 루트를 연 뒤 각 자식을 사용자 권한으로 재귀 삭제한다. 루트와 조상에 대한 `lstat`/실제 경로 검사, 저장소 내부 경계 검증이 없다. 자식 링크만 안전하게 지우는 동작으로는 **루트 자체가 링크인 경우**를 막지 못한다.
- **실제 상황:** 기존 `.superpowers/sdd/codex-tmp`가 사용자 자료 폴더를 가리키는 junction인 저장소에서 호출한다. 준비 단계는 기존 디렉터리를 받아들이고, 종료 단계는 링크 대상의 항목들을 열거하여 `codex-tmp/<항목>`으로 삭제한다. `.superpowers`나 `sdd`가 링크여도 같은 문제가 생긴다. Codex가 이번 호출 안에서 링크를 만들 수 있는지는 확인 못 함이며, 기존 링크만 있어도 성립하는 경로다.
- **제안:** 생성·삭제 전에 정리 루트와 조상 경로의 링크/reparse point 및 실제 경계를 확인하고, 확인 실패 시 삭제하지 않는다. 호출별 소유 임시 디렉터리로 범위를 좁힌다.

### S2. 프로젝트 설정과 exclude 쓰기의 경로·읽기 실패 검증 부재

- **심각도:** 높음.
- **위치:** `plugin/scripts/codex-run.mjs:37–42,153–178`; 보조로 `plugin/scripts/lib/cli-args.mjs:66–89`, `plugin/scripts/codex-task.mjs:109–121`.
- **문제:** `.codex/config.toml`, `.superpowers/sdd/.gitignore`, Git이 돌려준 `info/exclude`를 실제 대상 검증 없이 쓴다. `readText`는 ENOENT와 EACCES 등 모든 읽기 실패를 `null`로 합치고, exclude는 이를 빈 문자열로 바꿔 덮어쓴다. workspace 검사도 문자열 상대 경로만 검사한다.
- **실제 상황:** `.codex`가 외부 디렉터리 링크이면 `check`만으로 그곳의 `config.toml`을 덮어쓴다. 기존 exclude가 읽기 불가지만 쓰기는 가능하면 기존 제외 목록 대신 `.codex/` 한 줄을 쓴다. 정상 linked worktree에서 Git이 저장소 밖 common Git 디렉터리를 반환하는 것은 정상일 수 있으므로, 그 사실 자체를 버그로 판정하지 않았다.
- **제안:** ENOENT만 신규 파일로 취급하고 나머지 읽기 오류는 중단한다. 설정·진행 파일은 실제 저장소 내부, exclude는 확인된 Git common 디렉터리 내부라는 서로 다른 경계를 검증한다.

### S3. 유효한 TOML 표기만 바꿔도 샌드박스 확장 검사 누락

- **심각도:** 높음.
- **위치:** `plugin/scripts/lib/environment.mjs:42–70,89–93`, `plugin/scripts/lib/project-config.mjs:31–43`, `plugin/scripts/codex-run.mjs:184–194,264–272`.
- **문제:** 환경 검사는 TOML을 해석하지 않고 줄 시작의 인용되지 않은 키만 정규식으로 찾는다. 뒤의 `config/read` 검사는 apps와 TEMP/TMP/PYTHONPATH만 확인하여 이를 보완하지 않는다.
- **실제 상황:** 사용자 설정의 `[sandbox_workspace_write]` 아래 `"writable_roots" = ["D:/outside"]`, `"network_access" = true`, 또는 `sandbox_workspace_write = { network_access = true, writable_roots = ["D:/outside"] }`는 각 금지 정규식에 걸리지 않는다. 래퍼는 명세가 금지한 설정을 검출하지 못한 채 호출로 간다. 실제 샌드박스 권한 확장 여부는 공식 플러그인의 옵션 병합에 달려 있어 확인 못 함이지만 **호출 전 검증 누락은 코드로 확인**된다.
- **제안:** 이미 읽는 유효 설정의 sandbox 관련 값을 구조적으로 검증한다. 원문 읽기에 실패한 경우도 설정 부재와 구분한다.

### S4. 무시된 보호 파일과 디렉터리 자체의 링크는 검출하지 않음

- **심각도:** 높음.
- **위치:** `plugin/scripts/lib/git-changes.mjs:27–28`, `plugin/scripts/lib/protected.mjs:5–13`, `plugin/scripts/lib/run.mjs:70–74,93–116`, `plugin/scripts/codex-run.mjs:153–160`; 기준 `plugin/settings/workflow-settings.json:2`.
- **문제:** 보호 대조 입력은 무시 파일을 제외한 Git 상태뿐이다. 별도 해시는 루트 `.codex/config.toml` 하나만 본다. 또한 폴더 규칙 `.claude/`는 경로 `.claude` 자체에는 맞지 않는다.
- **실제 상황:** 무시된 미추적 `.claude/settings.local.json` 또는 루트 이외 `.codex/config.toml`을 변경하고 `CHANGED_FILES: none`을 보고하면 검사 대상에 나타나지 않는다. 처음부터 `.claude`라는 Git 링크 항목을 보고하는 경우도 `/.claude/` 부분 문자열이 없어 통과한다. Codex에서 각각의 파일 쓰기가 실제 허용되는지는 확인 못 함이다. 최신 명세가 대상을 ‘git이 보는 변경’으로 한정한 점은 따랐지만, 보호 경로 전체를 보장하지는 못한다.
- **제안:** 보호 디렉터리 자체도 일치시키고, 정책 파일의 무시 여부와 관계없이 호출 전후 내용을 대조한다. 해시 보호 대상과 Git 보호 대상의 차이를 명시한다.

### S5. 일부 한도 창의 형식 오류를 무시하고 통과

- **심각도:** 중간.
- **위치:** `plugin/scripts/lib/limits.mjs:24–36`, `plugin/scripts/lib/run.mjs:63–66`.
- **문제:** 존재하는 창에 `usedPercent`가 없거나 문자열이면 `continue`한다. 다른 창 하나가 정상이고 충분하면 전체 결과가 `ok`다. 수치 범위도 검사하지 않는다.
- **실제 상황:** Plus 응답의 primary가 `{usedPercent:"100", windowDurationMins:300}`, secondary가 `{usedPercent:0, windowDurationMins:10080}`이면 5시간 창을 버리고 주간 창만으로 호출을 허용한다. 음수 사용률도 남은 양을 100% 이상으로 만든다. 모든 창이 없을 때의 오류 처리와는 다른 분기다.
- **제안:** null인 선택 창과 존재하지만 잘못된 창을 구분하고, 후자는 종료 코드 5로 처리한다. 사용률은 유한한 0~100 숫자로 검증한다.

### S6. 기록 확인 실패가 ‘경고 없음·하위 에이전트 0’으로 바뀜

- **심각도:** 중간.
- **위치:** `plugin/scripts/codex-run.mjs:286–296`, `plugin/scripts/lib/run.mjs:179–185,225–229`, `plugin/scripts/lib/subagents.mjs:9–16,30–43`.
- **문제:** 메인 기록을 못 찾거나 미완 기록만 얻어도 `commands: []`로 정상 완료할 수 있다. 하위 기록의 개별 stat/read/JSON 실패는 내부에서 버리므로 바깥의 ‘하위 에이전트 확인 실패’ 경고까지 도달하지 않는다. 세션 디렉터리 부재도 빈 목록이다.
- **실제 상황:** Codex가 DONE을 반환했지만 기록 파일이 3초 안에 나타나지 않으면 네트워크·위험 명령 검사는 빈 명령 목록을 검사한다. 자식 기록에 EBUSY가 나면 그 자식의 토큰과 명령을 제외한 채 성공한다. `test/subagents.test.mjs:41–42`는 실제로 이 누락을 기대값으로 고정한다.
- **제안:** ‘완전하게 읽었고 0건’과 ‘읽지 못해 알 수 없음’을 별도 상태로 남긴다. 감지 결과와 토큰 합계에 완전성 표시를 전달하고, 필수 확인 실패의 중단 정책을 정한다.

### S7. 패치 표식이 포함된 실제 셸 명령을 위험 명령 검사에서 제외

- **심각도:** 중간.
- **위치:** `plugin/scripts/lib/rollout.mjs:12–17,61–62`, `plugin/scripts/lib/subagents.mjs:21–22`, `plugin/scripts/lib/risky.mjs:24–31`; 네트워크는 `plugin/scripts/lib/network.mjs:6`.
- **문제:** 도구 이름을 버리고 본문 문자열만 전달한 뒤, 어디에든 `*** Begin Patch`가 있으면 위험 검사를 생략한다. 실제 apply_patch인지 구분하지 않는다. 별도로 원격 Git 탐지는 `git` 바로 뒤의 하위 명령만 찾는다.
- **실제 상황:** 셸 명령 `Write-Output '*** Begin Patch'; Stop-Process -Id 12345`는 프로세스 종료 구문이 있어도 통째로 빠진다. `git -C . push origin HEAD:main`은 URL도 없어 네트워크 패턴을 통과한다. 둘 다 정적 문자열 대조 결과이며 실행하지 않았다.
- **제안:** 도구 종류와 실제 명령 인자를 보존하여 패치 도구만 제외한다. 원격 Git 탐지는 `-C`, `-c` 등 전역 옵션을 포함한 입력을 시험한다. 이 검사는 차단기가 아닌 탐지기라는 기존 정책은 유지할 수 있다.

### S8. 권한 문자열과 main 훅의 우회 표면

- **심각도:** 중간.
- **위치:** `.claude/settings.json:4–8,15–28`, 동일한 `project-template/.claude/settings.json:4–28`, `.githooks/pre-push:3–10`, `project-template/.githooks/pre-push:3–10`.
- **문제:** 권한 목록은 `git push`, `taskkill`, 셸 이름으로 시작하는 특정 형태에 의존한다. 훅은 실행됐을 때 원격 ref를 확인할 뿐 자신의 실행을 강제하지 않는다. `--no-verify`만 막아도 다른 훅 비활성화 경로는 남는다.
- **실제 상황:** `git -c core.hooksPath=NUL push origin HEAD:main`은 문자열상 `git push *` 및 `* --no-verify*`에 해당하지 않고 훅 경로도 바꾼다. 실행 파일의 전체 경로 호출, `bash -c`를 통한 호출도 현재 목록의 별도 점검 대상이다. **확인 못 함:** Claude 권한 엔진이 실제로 어느 형태를 정규화·재귀 검사하며 질문/거부하는지, 현재 hooksPath가 활성인지. 따라서 이 명령이 무조건 자동 승인된다고 단정하지 않는다. 훅이 실행되는 경우에는 `HEAD:main`, `--all`, 삭제 등도 입력의 remote ref로 검사하므로 refspec 표기만으로 우회된다는 지적은 하지 않는다.
- **제안:** 위험 실행을 문자열 deny 목록만으로 보장하지 말고 Git 전역 옵션·실행 파일 경로·중첩 셸을 포함한 권한 회귀 검증을 둔다. main에 대한 최종 제한은 원격 보호 정책과 함께 설계한다.

### S9. 외부 도구 목록의 내부 항목 형식 오류를 정상 부재로 읽음

- **심각도:** 중간.
- **위치:** `plugin/scripts/lib/project-config.mjs:46–52`, `plugin/scripts/codex-run.mjs:201–211`.
- **문제:** `data`가 배열인지만 검사하며 각 항목의 이름/형식은 검사하지 않는다. 알 수 없는 항목은 모두 필터에서 빠진다.
- **실제 상황:** `{data:[null]}` 또는 `{data:[{serverName:"codex_apps"}]}`는 예외 대신 `present:false`를 반환하고 check가 ‘외부 연결 도구 0개’라고 판정한다. 이런 응답이 현재 서버에서 실제 발생했는지는 확인 못 함이다. 빈 `data:[]`는 정상적인 서버 부재와 구분해야 하므로 그 자체를 오류로 지적하지 않는다.
- **제안:** 응답 항목 스키마를 검증하고 알 수 없는 구조는 확인 실패로 처리한다. 페이지가 나뉘는 응답의 지원 여부도 고정 프로토콜과 대조해야 한다(현재 구현에는 후속 페이지 처리가 없고 실제 필요 여부는 확인 못 함).

프로세스 종료 관련 범위: 검토한 자체 래퍼 코드에는 프로그램 이름으로 일괄 종료하는 명령이 없다. `lib/broker.mjs:28–34`는 PID에 신호 0으로 생존만 확인하고, 종료는 공식 라이브러리에 위임한다. 외부 라이브러리의 실제 PID 소유권 확인·teardown 동작은 이번 범위에서 확인 못 함이다. PID 없는 기록을 정리하는 동작은 이전 명세 `2026-10-05-stage3-codex-worker-design.md:136`에 명시돼 있어 새로운 구현 이탈로 세지 않았다.

## 2. 정확성

### C1. 정정 턴에서는 요청한 대화 ID와 응답 ID를 대조하지 않음

- **심각도:** 중간.
- **위치:** `plugin/scripts/lib/run.mjs:73–87,97–104,176–178`.
- **문제:** `resume`의 첫 턴만 ID를 대조한다. 형식 정정·변경 목록 정정은 항상 기존 대화를 이어야 하지만 응답 ID가 바뀌어도 `state.threadId`를 새 값으로 덮고 결과를 받아들인다.
- **실제 상황:** 첫 응답은 thread A에서 형식 오류, 정정 요청은 A로 보냈으나 연결부가 thread B의 DONE을 돌려주는 경우, 보고와 파일 목록만 맞으면 커밋하고 B를 재개 ID로 기록한다. 첫 호출이 start여도 정정은 같은 결함을 가진다. 공식 플러그인이 실제로 이런 응답을 낸 사례는 확인 못 함이다.
- **제안:** `runTurn` 공통 경로에서 resumeThreadId가 있으면 매번 응답 ID를 검증하고, 불일치 시 상태 덮어쓰기·커밋 전에 3으로 끝낸다.

### C2. 자동 정정은 한도 재확인과 공통 지시를 건너뜀

- **심각도:** 중간.
- **위치:** `plugin/scripts/lib/run.mjs:63–73,81–98`, `plugin/scripts/lib/report.mjs:80–88`; `plugin/scripts/test/run.test.mjs:436–442`.
- **문제:** 한도와 공통 규칙은 첫 턴에만 적용한다. 정정도 추가 유료 턴이며, 불일치 정정은 파일 삭제·ignore 추가까지 지시한다. ‘모든 지시문 앞’이라는 명세 §6과 구현도 다르다.
- **실제 상황:** 첫 턴이 남은 한도를 거의 소진하고 파일 목록을 빠뜨리면 다음 턴은 한도 확인 없이 실행된다. 같은 대화의 앞선 금지 지시는 남아 있지만 새 정정 지시에는 ‘불필요 파일이면 삭제하거나 ignore하라’만 반복되어 별도 안전 규칙 재주입은 없다. 공통 지시를 첫 턴에만 붙이는 것은 테스트가 명시적으로 기대한다.
- **제안:** 한도 확인과 공통 규칙 주입을 실제 각 턴 진입에 적용한다. 래퍼 호출당 한 번이 의도라면 명세와 스킬의 보장 범위를 좁혀야 한다.

### C3. 결과 파일 오류 뒤 성공 기록·다음 검수 지시를 먼저 출력

- **심각도:** 중간.
- **위치:** `plugin/scripts/codex-task.mjs:267–284,303–324`; `plugin/scripts/test/codex-task.test.mjs:149–155`.
- **문제:** 결과 파일이 없거나 JSON 파싱이 실패해도 먼저 프로세스의 0을 진행 기록과 요약에 쓰고 `next: 검수로`를 출력한 뒤 실제로는 3으로 종료한다. JSON 문법만 맞는 `null`, `{}` 등은 오류로 보지도 않는다. 결과의 종료 코드와 자식 프로세스 코드도 대조하지 않는다.
- **실제 상황:** 래퍼 프로세스는 0인데 파일이 `{not json`이면 `progress.md`에 `exit 0 -, commit -`가 남고 화면은 검수를 안내하지만 최종 종료는 3이다. 결과가 `null`이면 그대로 0으로 끝난다. 재개 시 기록을 믿는 경로와 실행 시 종료 코드를 믿는 경로가 갈린다.
- **제안:** 필수 결과 필드·상태·종료 코드의 정합성을 먼저 검증하고, 최종 결정된 코드로 기록·요약·다음 행동을 함께 생성한다.

### C4. 사용량 기록 실패와 깨진 줄이 최종 합계에서 사라짐

- **심각도:** 중간.
- **위치:** `plugin/scripts/lib/run.mjs:311–345`, `plugin/scripts/lib/usage.mjs:20–31,38–50`, `plugin/scripts/codex-task.mjs:296`.
- **문제:** 결과 JSON을 먼저 저장한 뒤 사용량 줄 추가에 실패하면 메모리상의 reason만 바뀌고 이미 쓴 JSON은 갱신하지 않는다. codex-task는 JSON reason을 우선하므로 래퍼 stdout에 남은 오류가 가려진다. 합계 함수는 깨진 JSONL 줄을 아무 표시 없이 버린다. 턴 실행 전 환경/한도 실패는 `turns.length === 0`이어서 호출 기록에 들어가지 않는다.
- **실제 상황:** 커밋과 결과 JSON 저장은 성공하고 `codex-calls.jsonl`만 EACCES가 나면 작업은 성공으로 남지만 해당 호출의 토큰은 합계에서 빠진다. 끝줄이 손상된 과거 기록도 제외된 줄 수 없이 정상 합계로 출력된다. 따라서 보고의 ‘호출 수·실패 수’는 전체 래퍼 시도 수가 아니다.
- **제안:** 기록 오류를 결과의 명시적 필드와 경고에 넣고 작업 스크립트로 전달한다. 손상/누락 건수와 실제 Codex 턴 호출 수·사전 거부 수를 구분한다.

### C5. 하위 기록의 mtime 필터가 재개 시 중복·누락을 함께 만듦

- **심각도:** 중간.
- **위치:** `plugin/scripts/lib/subagents.mjs:23–24,33–54`, `plugin/scripts/lib/run.mjs:271–277`, `plugin/scripts/lib/usage.mjs:47–49`.
- **문제:** mtime이 이번 호출 이후이면 자식의 전체 누적 토큰을 합산한다. 이전 부모 자식의 기록을 후보에서 먼저 제외하므로, 오래된 자식 아래에서 새로 활동한 손자까지 연결하지 못한다.
- **실제 상황:** 첫 호출에서 자식 C의 누적 100을 세고 두 번째 호출에서 C가 누적 150이 되면 총 250으로 합쳐 실제 누적 150보다 크게 센다. 반대로 C 파일은 그대로인데 손자 G만 이번 호출 중 갱신되면 C가 parents 집합에 없어서 G는 빠진다. 중복 문제는 `docs/reports/2026-10-11 비용 개선 구현 보고.md:117`에서 **이미 보류**됐으므로 새 발견으로 세지 않는다. 손자 연결 누락은 별도 경계 사례다.
- **제안:** 계보 검색은 오래된 메타데이터도 포함하고, 사용량은 호출 전후/턴별 차이로 합산한다. 현재 보류를 유지하면 재측정 결과에 이 불완전성을 표시한다.

### C6. 직접 app-server 요청의 60초 제한에 close는 포함되지 않음

- **심각도:** 중간.
- **위치:** `plugin/scripts/codex-run.mjs:48–74`; 외부 대기 `plugin/scripts/codex-task.mjs:265–266`, `plugin/scripts/codex-check.mjs:178–184`.
- **문제:** 요청이 시간 초과로 reject해도 `finally`의 `await client.close()`에는 상한이 없다. 외부 close가 완료되지 않으면 원래의 60초 timeout 결과도 반환되지 않는다. 연결 호출 자체도 try 진입 전에 시작하므로 동기 throw는 같은 정리 경로를 거치지 않는다.
- **실제 상황:** 서버 무응답으로 request가 제한 시간에 걸린 뒤 close도 pending이면 `limits`/`check`가 계속 대기한다. 실제 고정 라이브러리의 close에 자체 상한이 있는지는 확인 못 함이므로 런타임 hang 발생은 **추측**이다. 자체 코드가 정리까지 제한 시간을 보장하지 않는 점은 확인했다.
- **제안:** 연결·요청·close 전체의 제한 시간을 명시하고, close 실패를 원래 오류와 함께 보존한다. 외부 라이브러리가 보장한다면 그 계약을 연결부 테스트로 고정한다.

### C7. 동시 실행·시간 초과 잔존 명령에 공용 임시 폴더 정리가 간섭

- **심각도:** 중간.
- **위치:** `plugin/scripts/lib/project-config.mjs:8`, `plugin/scripts/lib/run.mjs:152–173,235–238`, `plugin/scripts/lib/temp-cleanup.mjs:16–18`, `plugin/scripts/codex-task.mjs:118–121,242–264`; `plugin/skills/codex-execution/SKILL.md:115,133`.
- **문제:** 임시 폴더는 저장소 전체가 공유하며 호출 소유권·잠금이 없다. 같은 task의 지시·보고 파일도 고정 이름이다. 명세와 스킬의 ‘한 번에 하나’는 문장 제한이며, 시간 초과 뒤 명령이 계속 도는 경우에는 이를 지켜도 잔존 실행과 겹칠 수 있다.
- **실제 상황:** 두 Claude 세션이 같은 저장소를 실행하면 먼저 끝난 래퍼가 나중 실행의 임시 파일까지 지운다. 단일 세션에서도 2분 감시를 넘겨 동작하는 명령이 쓰는 TEMP를 종료 단계에서 비울 수 있다. 재개의 Git 파일 목록 비교는 같은 파일의 추가 내용 변경이나 아직 쓰지 않은 실행을 증명하지 못한다(검토 1의 C4-3과 중복).
- **제안:** 저장소 실행 잠금과 호출별 임시 폴더를 두고, 종료 확인이 안 된 호출의 임시 자료는 자동 삭제하지 않는다. 재개 조건은 내용 변화와 이전 실행 상태를 구분한다.

### C8. 최종 수정 뒤 보정 없는 전체 테스트와 최종 검수 상태 확인 누락

- **심각도:** 높음.
- **위치:** `plugin/skills/codex-execution/SKILL.md:117,168–175`, `plugin/skills/codex-execution/final-fix-prompt.md:7`; 계획 재개 `plugin/skills/codex-planning/SKILL.md:68,106`.
- **문제:** 최종 판단 기준인 마스터 전체 테스트가 최종 수정 **전에** 있다. 수정 뒤에는 Codex의 보정된 환경에서만 전체 테스트를 요구한다. 재개도 `Final review:`/`Plan review:` 줄의 존재를 기준으로 검수를 건너뛰며 승인 결과·해당 HEAD를 확인하는 계약이 없다.
- **실제 상황:** 마스터 테스트 실패를 final-fix가 고친 뒤 Codex 테스트만 통과하면 최종 코드에 대한 보정 없는 근거가 없는 상태로 보고 단계로 간다. `Final review: 수정 필요` 뒤 중단된 기록도 결과 상태 대신 줄의 존재만 읽으면 완료 단계로 오인할 여지가 있다(이 오독의 실제 발생은 추측).
- **제안:** 마지막 코드 수정 후의 HEAD에서 마스터 전체 테스트를 요구한다. 재개 기록에 검수 대상 커밋·승인/수정 필요/확인 불가와 다음 단계를 명시한다. 검토 1의 C4-1·C4-2 재확인이다.

### C9. timeout 입력·Python 권한 오류에서 불필요한 조기 중단/반복

- **심각도:** 낮음.
- **위치:** `plugin/scripts/lib/cli-args.mjs:47–50`, `plugin/scripts/lib/run.mjs:137–139`, `plugin/scripts/sandbox-python/sitecustomize.py:20–31`; 대조 `plugin/scripts/codex-task.mjs:70–74`.
- **문제:** codex-run은 `--timeout-min Infinity`를 양수로 받아들이지만 codex-task는 거부한다. 매우 큰 시간값도 타이머의 유효 범위를 검증하지 않는다. Python 보정은 부모가 디렉터리이기만 하면 PermissionError를 TMP_MAX 근처까지 재시도한다.
- **실제 상황:** 직접 래퍼 호출의 Infinity/과대 시간값은 요청한 제한 시간과 다른 타이머 동작을 낳을 수 있다(해당 Node에서의 실제 경고·지연값은 확인 못 함). 읽기만 가능한 기존 디렉터리를 `mkdtemp(dir=...)`에 주면 이름을 바꿔도 권한은 달라지지 않는데 반복한다.
- **제안:** 양쪽 CLI에서 유한성과 허용 최대 시간을 같게 검증한다. Python 재시도는 이름 충돌로 판단 가능한 경우로 한정하고 다른 권한 오류는 즉시 반환한다.

### 종료 코드·기록 형식 대조

| 항목 | 정적 확인 결과 | 필요한 수정/한계 |
|---|---|---|
| 0/2/3/4/5 | `lib/pins.mjs:12`와 두 스킬 표의 숫자 매핑은 일치 | 0은 변경 없는 DONE에서도 가능. 두 스킬의 ‘커밋됨’ 표현은 ‘변경이 있으면 커밋’으로 수정 필요(심각도 낮음, 검토 1 B6). |
| 한도 사전 오류 | `run.mjs:65–66`은 부족 4, 확인 실패 5 | 최초 턴 전만 확인(C2). 예기치 못한 예외는 일반 catch의 3. |
| shutdown | `codex-run.mjs:90–110`은 라이브러리 로드 실패 5, 종료 불명확 3 | 실행스킬:188–190은 0/3만 설명. 5일 때 closed를 기록하지 않는다는 안내 보완(낮음, 검토 1 B6). |
| `Task N: base`, `codex thread`, `Final fix` | `codex-task.mjs:264,279–284`가 추가 토큰 필드를 붙이고 `appendLedger:121`가 `- ` 접두를 붙임 | 스킬이 의미로 읽는 구조이며 이것만으로 형식 오류는 아님. C3의 실제 코드 모순은 별도. |
| `멈춤:`, `재개:`, `Final review:`, `Usage log:`, `Broker:` | 실행스킬:65,114,169,181,189와 명세 §16 대응 | ledger는 텍스트를 한 줄로 기록할 뿐 값/상태를 검증하지 않는다. 마스터 책임인 부분을 자동 보장으로 읽으면 안 됨. |
| 계획 수정의 코드 2 | 계획스킬:43→100은 `resume --role plan`, 수정은 :113의 `plan-fix` | 같은 역할/라운드로 재개하라는 실행스킬:143과 달리 계획 쪽 안내가 모호함(중간, 검토 1 B8). 계획 수정 도중 맥락 부족에서 발생; plan-fix 유지 지시 필요. |

Windows 경로·한글·CRLF: 코드에서 `utf8`, NUL 구분 Git 상태, `\r?\n` 처리를 확인했다. 실제 Git Bash/Windows 경로 변환 및 한국어 출력은 이번에 실행하지 않아 확인 못 함이다. 안전 경계의 링크 문제(S1·S2)를 문자 인코딩 문제와 혼동하지 않았다.

## 3. 최신 명세와 구현의 차이

기준은 `docs/superpowers/specs/2026-10-10-stage3-cost-fixes-design.md`다. **구현됨은 해당 소스/문장 절차가 있다는 뜻이며 실행 통과를 뜻하지 않는다.** 실험·배포·비용 측정처럼 코드만으로 판정할 수 없는 절은 구현 상태와 증거 한계를 함께 적었다. 이미 1·2절에서 상세 지적한 항목은 ID로 연결한다.

| 명세 절 | 판정 | 현재 구현과 근거(파일:줄) | 차이/남은 확인 |
|---|---|---|---|
| 1.1 범위, 1.2 제외 범위 | 구현됨 | 새 래퍼 기능 `plugin/scripts/codex-run.mjs:90–137,164–222`; 작업 자동화 `plugin/scripts/codex-task.mjs:124–324` | QA·위키·예약 재개·보호 경로 프로젝트별 확장은 이번 코드에 없음. 원래 제외 범위다. |
| 1.3 성공 기준 | 구현됨(점검 수단) | `plugin/scripts/codex-check.mjs:21,221–243,246–384`; `plugin/scripts/test/` | 현재 HEAD의 단위/연결부/흐름/배포 후 통과는 확인 못 함. 검토 1 기록의 과거 통과 수를 현재 증거로 쓰지 않았다. |
| 2.1 요금제·창 길이 | 구현됨 | `plugin/settings/workflow-settings.json:4–9`; `plugin/scripts/lib/limits.mjs:24–32` | 현재 계정이 prolite인지 확인 못 함. 부분 형식 오류는 S5. |
| 2.2 프로젝트 설정 적용 | 구현됨 | `plugin/scripts/codex-run.mjs:184–194`; `plugin/scripts/lib/project-config.mjs:31–43` | 비활성 층에서 ephemeral thread 시작 후 재확인. 실제 적용은 미실행. |
| 2.3, 2.8 하위 에이전트 설정 차단 실패의 대응 | 구현됨 | `plugin/scripts/lib/project-config.mjs:16–26`; `plugin/scripts/lib/common-rules.mjs:6`; `plugin/scripts/lib/subagents.mjs:30–58` | 무효 설정을 추가하지 않고 지시·탐지 사용. 기록 누락/집계 제한 S6·C5. |
| 2.4 임시 폴더 보정 | 구현됨 | `plugin/scripts/sandbox-python/sitecustomize.py:9–36`; `plugin/scripts/lib/project-config.mjs:23–24` | 과거 실험 자체는 재현 안 함. 링크 경계와 권한 오류는 S1·C9. |
| 2.5 외부 연결 도구 끄기 | 구현됨 | `plugin/scripts/lib/project-config.mjs:20–21`; `plugin/scripts/codex-run.mjs:201–212` | 잘못된 목록 항목 처리 S9. |
| 2.6 plugin list 출력 한도 | 구현됨 | `plugin/scripts/codex-run.mjs:234–235` | 64MiB, 120초 상한. 현재 목록 크기·실제 성공은 확인 못 함. |
| 2.7 Pro 재실행 수치 | 구현됨(기록) | 명세 자체 `:100–119`의 실험 표; 관련 집계 `plugin/scripts/lib/usage.mjs:46–49` | 역사적 실험 기록이며 현재 효과나 원인 검증이 아님. 재측정 완료로 간주하지 않음. |
| 3.1 파일 생성·git 제외 | 구현됨 | `plugin/scripts/codex-run.mjs:153–178`; `project-template/.gitignore:5` | 지정 TOML·TEMP·PYTHONPATH 생성. 링크·읽기 오류 위험 S2. |
| 3.2 호출 전 config/read·check에서 apps 확인 | 구현됨 | `plugin/scripts/lib/run.mjs:40–52`; `plugin/scripts/codex-run.mjs:184–212` | 매 start/resume은 설정, check만 도구 목록을 확인하는 명세와 일치. 샌드박스 관련 구조 검사는 S3. |
| 3.3 호출 뒤 해시 | 구현됨 | `plugin/scripts/lib/run.mjs:70–85,97–98`; `plugin/scripts/codex-run.mjs:238` | 첫 턴 및 정정 뒤 해시 변경은 커밋 전 3. 다른 무시 파일까지 보호하지는 않음(S4). |
| 3.4 신뢰 목록 읽기·정리 제안 | 구현됨 | `plugin/scripts/codex-run.mjs:126–136`; `plugin/scripts/lib/trust.mjs:7–24` | 경로·존재·TOML 헤더·승인/백업 안내. 설정의 전체 블록/삭제할 줄을 그대로 보여 주지는 않으므로 명세 :186의 표현보다 좁다. 보고 전용 저위험 차이. |
| 4.1 Python 보정 | 다르게 구현됨 | `plugin/scripts/sandbox-python/sitecustomize.py:9–31` | 3.13 이상에서만 활성인 것은 구현보고 :108에 이유가 기록된 결정. 권한 오류 재시도 범위가 넓음(C9). 최종 보정 없는 테스트 시점은 C8. |
| 4.2 명령 전용 TEMP/TMP | 구현됨 | `plugin/scripts/lib/project-config.mjs:8,23–24`; `plugin/scripts/codex-run.mjs:171–174` | 브로커 환경 전체를 바꾸지 않음. 호출별 분리는 없음(C7). |
| 4.3 호출 뒤 정리·새 폴더 경고 | 구현됨 | `plugin/scripts/lib/run.mjs:224–248,255–260`; `plugin/scripts/lib/temp-cleanup.mjs:6–42` | 루트 링크 경계 S1. 실패 결과별·동시 실행 시험 공백은 §4. |
| 4.4, 6 공통 지시 | 다르게 구현됨 | `plugin/scripts/lib/common-rules.mjs:3–15`; `plugin/scripts/lib/run.mjs:73,84,97` | 최초 지시에는 있으나 두 자동 정정 지시에는 안 붙임. 명세 :219,231의 ‘모든 지시문’과 차이(C2). |
| 5 하위 에이전트 억제·경고 기록 | 구현됨 | `plugin/scripts/lib/common-rules.mjs:6`; `plugin/scripts/lib/run.mjs:225–234,255`; `plugin/scripts/codex-task.mjs:287` | 실패로 바꾸지 않는 정책은 명세대로. 확인 실패가 0건이 되는 것은 별도 결함(S6). 계획에서는 개별 접두 대신 `경고:`로 기록(계획 SKILL.md:37). |
| 7 메인+하위 토큰, 하위 명령 | 구현됨 | `plugin/scripts/lib/run.mjs:271–280,335–339`; `plugin/scripts/lib/usage.mjs:46–50` | 정상 경로의 필드는 존재. 중복·누락·기록 실패 C4·C5·S6. |
| 8 위험 명령과 과거 명령 자료 | 다르게 구현됨 | `plugin/scripts/lib/risky.mjs:3–21,24–31`; `plugin/scripts/test/risky.test.mjs:50–57` | 요구 패턴은 있음. 패치 표식 전체 제외 S7. 명세는 뒤쪽 점도 단어 경계에서 제외하나 E 정규식에는 점이 없어 `kill.txt` 같은 언급도 맞을 수 있음(낮음, 경고 오탐은 이미 보류됨). 과거 254명령 시험은 새 형태를 보장하지 않음. |
| 9 보호 경로 대조 | 구현됨 | `plugin/settings/workflow-settings.json:2`; `plugin/scripts/lib/run.mjs:112–116,266–269` | Git 변경 대조·미커밋·변경 보존은 존재. 무시/디렉터리 링크 누락 S4. |
| 10.1 한도 동작·호출 전 검사 | 구현됨 | `plugin/scripts/codex-run.mjs:113–123,215–221`; `plugin/scripts/lib/run.mjs:63–66`; 두 스킬 준비 단계 | 정상 응답은 0/4/5. 부분 오류 S5. 자동 정정까지 매 턴 재확인은 없음(C2). |
| 10.2 기준값 파일·요금제 미등록 오류 | 구현됨 | `plugin/settings/workflow-settings.json:2–10`; `plugin/scripts/lib/limits.mjs:14–22`; `CLAUDE.md:45` | 명세의 Plus/Pro 수치와 일치. 설정 파서는 빈 protectedPaths도 허용(`lib/settings.mjs:13`); 기본 파일은 비어 있지 않아 현행 결함으로 확대하지 않음. |
| 10.3 기준값 근거·재산정 | 구현됨(초깃값) | `plugin/scripts/lib/settings.mjs:29–32`; `plugin/settings/workflow-settings.json:5–9` | 계산식 및 100% 상한 동일. 재측정 기반 조정은 확인 못 함. 계획 재개는 plan 기준 사용(계획 SKILL.md:64); Pro는 call과 같지만 Plus는 plan 50/10, call 30/5로 더 엄격하다. |
| 11 실행 중 질문·권한 규칙 | 구현됨 | `plugin/skills/codex-execution/SKILL.md:50–67`; `project-template/CLAUDE.md:37` | `Ruling:`·사람 확인 경로 존재. 코드가 질문/완료 상태를 강제하는 것은 아님. |
| 12 마스터 메시지·보고 | 다르게 구현됨 | `project-template/CLAUDE.md:16–19`; 계획 SKILL.md:55–57; 실행 SKILL.md:69–71,175–179 | 단계·한국어·선택지·보고 규칙 존재. 진행 중 보고는 무시 폴더, 최종만 docs/reports로 변경됨. `docs/reports/2026-10-11 흐름 확인 결과.md:33`에 후속 사용자 결정이 있어 결함으로 세지 않음. |
| 13 요청 때만 계획 관문 | 구현됨 | `plugin/skills/codex-planning/SKILL.md:125–131`; `project-template/CLAUDE.md:24` | 작은 계획 Sonnet 선택(:104)도 있어 마지막 ‘Opus 검수’는 용어 불일치(낮음). |
| 14 명세 경계 조건 | 구현됨 | `project-template/CLAUDE.md:23` | 인코딩·줄 나누기·반올림·표기 예시 명시. 도메인별 확장은 예정대로 없음. |
| 15 run/review/ledger 자동화 | 구현됨 | `plugin/scripts/codex-task.mjs:118–205,217–324` | 실제 작업·검수 호출은 마스터가 담당. 실패 요약 C3. ledger는 형식 검증 없는 자유 문자열이다. |
| 16.1 기록 줄 | 구현됨 | `plugin/scripts/codex-task.mjs:264–291`; 실행 SKILL.md:65,114,169–190; 계획 SKILL.md:52,65,97–120 | 필수 접두·마무리 기록 존재. 상태와 승인 여부는 별도 검증 없음(C8). |
| 16.2 새 세션 재개 | 구현됨 | `project-template/CLAUDE.md:29`; 실행 SKILL.md:107–117; 계획 SKILL.md:59–68 | 기본 단계 선택과 같은 대화 재개 있음. 실패 검수 기록 해석·동작 중 프로세스 판단은 C7·C8. |
| 16.3 멈춤 안내 | 구현됨 | 실행 SKILL.md:63–67; 계획 SKILL.md:50–53 | 새 세션 재개 안내 존재. ‘다음 명령 전체 인자’는 마스터가 작성해야 함. |
| 17 연결부 점검 1~14 | 구현됨 | `plugin/scripts/codex-check.mjs:21,221–243,246–384` | 각 항목 코드가 존재. 실행하지 않았으므로 통과 확인 못 함. 경계 점검은 모델이 복사한 TESTS와 파일 부재에 일부 의존(§4). |
| 18 배포 후 재측정 | 구현 안 됨(이 검토에서 완료 근거 없음) | 측정 입력 절차는 계획 SKILL.md:92,129; 실행 SKILL.md:178–186; 집계 `lib/usage.mjs:20–53` | 새 동일 명세 프로젝트의 측정·사용자 승인·대기 비용 분리는 코드만으로 완료 판정 불가. 의도된 후속 운영 작업이며 미실시라고 단정하지 않음. |
| 19 남은 일 | 구현 안 됨(의도된 보류 항목) | 명세 :460–469; 현재 보호 규칙 `plugin/settings/workflow-settings.json:2`와 환경 검사 `lib/environment.mjs:73–94` | 자체 개발에서 플러그인 포함 경로 거부, Claude 쓰기 경로 검사 훅, 4단계 프로필 확장 없음. 지금 승인 범위의 미완료 기능으로 세지 않음. |

3.4의 trust-report 출력 축소와 8의 점 경계 차이는 위 표에 구체 입력/위치와 영향을 적었다. 전자는 사용자에게 삭제 블록 전체를 보여 주도록 문구·출력을 맞추고, 후자는 실행 명령 파싱과 함께 경계를 수정하는 수준을 제안한다. 나머지 차이는 1·2절의 심각도·사례·제안으로 갈음한다.

## 4. 시험 공백

아래는 테스트 소스를 읽어 확인한 **없는 검증 또는 잘못된 기대값**이다. 현재 테스트의 통과/실패는 확인 못 함이다. 테스트 이름에 ‘시간 초과’가 있다는 사실과 그 경로에서 정리·기록·재개까지 확인한다는 사실을 구분했다.

| ID·심각도 | 위치(기존 검증) | 문제와 실제로 빠진 상황 | 제안하는 검증 |
|---|---|---|---|
| T1 높음 | `plugin/scripts/test/temp-cleanup.test.mjs:8–26,36–41`; 구현 `lib/temp-cleanup.mjs:6–18` | 정상 삭제·EPERM·읽기 실패만 확인. 정리 루트/조상의 junction과 저장소 밖 대상(S1)은 없음. | 격리된 테스트 안에서 링크 대상의 표식 파일이 보존되고 정리가 거부되는지 확인. 실제 사용자 폴더는 사용하지 않는다. |
| T2 높음 | `plugin/scripts/test/project-config.test.mjs:10–59`; 실제 I/O `codex-run.mjs:153–198` | 문자열 생성·유효 설정 함수만 검사. `.codex` 링크, exclude 읽기 EACCES, worktree common Git 경로, 쓰기 중 실패(S2)는 없음. | 파일 접근을 대체하여 ENOENT와 다른 실패 구분·쓰기 금지를 검증하고, 별도 worktree 통합 사례를 둔다. |
| T3 높음 | `plugin/scripts/test/environment.test.mjs:77–101`; `project-config.test.mjs:31–50` | 인용 키·인라인 테이블·유효 설정의 확장된 roots/network(S3)는 없음. 원문이 null이면 통과하는 기대값도 존재. | 서로 다른 TOML 표기가 같은 금지 판정을 내며 설정 읽기 실패가 성공으로 바뀌지 않도록 검증. |
| T4 높음 | `plugin/scripts/test/protected.test.mjs:7–26`; `run.test.mjs:480–493,621–626` | Git이 제공했다고 가정한 파일 목록 위주. 무시된 정책 파일, `.claude` 자체의 링크, 삭제·링크 교체(S4)가 없음. | Git 입력만으로 사라지는 경로와 해시 검사 대상을 함께 검증. 커밋이 일어나지 않는지 확인. |
| T5 중간 | `plugin/scripts/test/limits.test.mjs:37–68`; `run.test.mjs:445–470` | 정상/부족/미등록/모든 창 없음은 있지만, 한 창만 잘못된 값·음수/범위 초과·중복 창은 없음(S5). | 올바른 다른 창이 있어도 형식 오류면 5이며 Codex 호출 0회인지 확인. |
| T6 중간 | `plugin/scripts/test/run.test.mjs:150–193,347–360,436–442` | 첫 resume의 ID 오류는 검사하나 형식/불일치 정정에서 ID 교체(C1)는 없음. 공통 규칙은 두 번째 턴에 없기를 기대(C2). | 세 턴 각각의 ID·한도·공통 규칙 계약을 검증. 첫 턴 정상 뒤 두 번째 턴 조건만 바꾸는 사례 필요. |
| T7 중간 | `plugin/scripts/test/run.test.mjs:258–345,524–538` | timeout·interrupt 실패 시험은 있으나 그 테스트에서 임시 정리·하위 탐지·사용량 기록 완료를 함께 검증하지 않는다. 정리 시험은 성공과 일반 예외 두 경우만 확인. | timeout, LIMIT, STOPPED, 해시 실패별로 정리 횟수·기록·남은 변경을 확인. 살아 있는 명령과 정리 충돌(C7)은 별도 격리 시험. |
| T8 중간 | `plugin/scripts/test/subagents.test.mjs:20–42`; `run.test.mjs:355–360,412–431`; `usage.test.mjs:16–35` | EBUSY 자식 생략·비배열 결과 0개·깨진 JSONL 줄 무시를 정상 기대값으로 둔다(S6·C4). 재개 자식 누적과 오래된 부모/새 손자(C5)는 없음. | 완전성 경고와 누락 건수, 동일 자식의 호출간 차액, 오래된 계보 유지 검증. |
| T9 중간 | `plugin/scripts/test/codex-task.test.mjs:142–155`; `codex-task.mjs:267–324` | 잘못된 JSON 문법/없는 파일만 시험하며 실패 시 ledger의 `exit 0`을 기대한다. 유효 JSON `null`, `{}`, 잘못된 필드, 프로세스/JSON 코드 불일치(C3)는 없음. | 최종 종료·ledger·stdout·next가 모두 실패로 일치하는지 검증. |
| T10 중간 | `plugin/scripts/test/run.test.mjs:380–390`; `lib/run.mjs:311–345` | 결과 JSON 쓰기 실패는 있지만 JSON 저장 성공 후 appendLine만 실패하는 시험(C4)은 없음. | 사용량 추가 실패가 최종 JSON/작업 요약에 남으며 정상 합계로 오인하지 않는지 확인. |
| T11 중간 | `plugin/scripts/test/project-config.test.mjs:53–59`; `codex-run.mjs:48–74,201–211` | apps 응답 최상위 누락만 시험. data 내부 비정상 항목(S9), 직접 client 연결 지연·close pending/throw(C6)는 없음. | 순수 응답 검증과 client 생명주기 대체 객체를 사용해 상한 및 원래 오류 보존 확인. |
| T12 중간 | `plugin/scripts/test/risky.test.mjs:10–57`; `plugin/scripts/test/network.test.mjs:5–28` | 과거 254명령과 표준 명령만으로 패치 표식 혼합 셸, Git 전역 옵션(S7), 명령 인자 배열 형태를 보장하지 못함. | 도구 이름과 arguments를 포함한 기록에서 탐지까지 이어지는 회귀 자료 추가. 패치 본문은 제외하되 셸의 표식 문자열은 제외하지 않도록 검증. |
| T13 중간 | `plugin/scripts/test/template.test.mjs:10–34`; 권한·훅 `.claude/settings.json:4–28`, `.githooks/pre-push:3–10` | 템플릿 문구만 검사. 권한 매칭의 경로/중첩 셸 형태 및 pre-push의 여러 ref 입력 시험은 없음. | 네트워크 없는 합성 stdin으로 ref 판정을 시험하고, 실제 권한 매칭은 별도 승인된 하네스 검증으로 구분. 훅 비활성화 자체는 훅 단위 테스트로 해결되지 않음. |
| T14 높음 | `plugin/scripts/test/skills.test.mjs:78–89`; 실행 SKILL.md:168–175 | ‘보정 모듈 없이’, `Final review:` 등 문구 존재만 확인하며 최종 수정 이후 전체 테스트 순서·실패 검수의 재개(C8)를 검사하지 않음. | final-fix로 HEAD가 바뀐 경우와 ‘수정 필요’ 기록 후 중단된 경우의 절차 검증 자료를 둔다. |
| T15 낮음 | `plugin/scripts/test/sandbox-shim.test.mjs:6–8,25–36`; shim :9–36 | Windows와 Python 실행 가능 여부만으로 첫 테스트를 켜며 Python <3.13에서도 `_mkdtemp`를 기대한다. 내부 함수 부재·PermissionError 반복(C9)은 없음. | 3.13 미만/이상/내부 함수 부재를 나눠 검증하고, 보정 미활성 환경에서 정상 원본 함수 사용을 기대한다. |
| T16 중간 | `plugin/scripts/codex-check.mjs:96–140,305–318`; `plugin/scripts/test/check-eval.test.mjs:13–60` | 경계 점검은 모델이 TESTS로 복사한 `denied`와 파일 부재를 사용한다. 명령 미실행·다른 OSError도 denied처럼 보일 수 있다. | probe 실행 여부와 errno를 구분한 증거를 읽도록 한다. 쓰기 거부와 경로 없음 등의 오류를 구별해 거짓 통과를 시험. 실제 거짓 보고 발생은 확인 못 함. |

사용자 중단(Ctrl+C)·강제 종료·부모 프로세스 timeout에서의 정리는 별도 공백이다. `codex-run.mjs:305–307`, `codex-task.mjs:264–324`, `codex-check.mjs:236–243`에는 종료 신호에 맞춘 결과 보존 흐름이 없고, 단위 테스트에도 해당 검증은 찾지 못했다. **심각도 중간:** 작업자가 변경을 남긴 뒤 외부에서 래퍼를 중단하면 대화 ID·결과 파일이 저장되기 전에 끝나거나 브로커가 남을 수 있다. 호출 시작 기록을 먼저 저장하고, 중단 시 재개 정보와 정리 불가 상태를 보존하는 검증을 제안한다. Ctrl+C 브로커 잔류 자체는 구현보고 :128에서 이미 보류된 항목이다.

## 5. 유지보수

### 공식 Codex 플러그인·CLI 내부에 기대는 지점

아래는 변경 시 확인할 계약 목록이다. 의존 자체를 버그로 세지는 않는다. 설치된 외부 소스는 이번 검토 대상이 아니며 현재 구현과의 실시간 호환은 확인 못 함이다.

| 의존 | 위치 | 버전 변경 때 깨질 수 있는 계약 |
|---|---|---|
| 플러그인 캐시·설치 기록 | `plugin/scripts/lib/pins.mjs:19–28`; `plugin/scripts/lib/environment.mjs:5–39` | `~/.claude/plugins/cache/<marketplace>/.../<version>` 구조, installed_plugins.json의 plugins/key/첫 entry/version/gitCommitSha, CLI의 공백 구분 목록 형식. |
| `runAppServerTurn` | `plugin/scripts/codex-run.mjs:31–34,262–280` | cwd+options 인자, resumeThreadId/effort/model/sandbox/persistThread/threadName, progress의 threadId/turnId, 결과 status/finalMessage/error. 승인 정책 never를 이 호출 옵션에서 직접 지정하지 않아 외부 함수의 기본 정책에도 의존한다. |
| `interruptAppServerTurn` | `plugin/scripts/codex-run.mjs:282–284`; `plugin/scripts/lib/run.mjs:204–219` | 함수 이름·인자·interrupted/detail 결과 및 요청이 실제 명령 프로세스 종료를 보장하지 않는다는 한계. |
| 직접 app-server client | `plugin/scripts/codex-run.mjs:48–79` | `CodexAppServerClient.connect(cwd,{disableBroker:true})`, request/close, ephemeral thread/start 옵션, close의 완료 보장. |
| 설정·신뢰 계층 | `plugin/scripts/codex-run.mjs:129,184–194`; `plugin/scripts/lib/project-config.mjs:31–43` | config/read의 config/layers/name.type/disabledReason, 프로젝트 신뢰 등록이 thread/start에서 일어난다는 부수 효과. |
| MCP 도구 목록 | `plugin/scripts/codex-run.mjs:203–208`; `plugin/scripts/lib/project-config.mjs:46–52` | threadId, detail=toolsAndAuthOnly, data/name/tools, 서버명 codex_apps, 단일 응답이 전체 목록이라는 가정. |
| 한도 API | `plugin/scripts/codex-run.mjs:117–118,217–218`; `plugin/scripts/lib/limits.mjs:4–32` | account/rateLimits/read, rateLimitsByLimitId.codex 우선순위, planType/primary/secondary/usedPercent/windowDurationMins/resetsAt. |
| 브로커 생명주기 | `plugin/scripts/codex-run.mjs:90–110`; `plugin/scripts/lib/broker.mjs:5–25` | loadBrokerSession/sendBrokerShutdown/teardownBrokerSession/clearBrokerSession, session endpoint/PID/각 경로. 이전 명세 :81의 CLAUDE_PLUGIN_DATA 환경 공유 계약도 유지 필요. |
| 세션 파일 구조 | `plugin/scripts/lib/rollout.mjs:5–17,35–67`; `plugin/scripts/lib/subagents.mjs:7–24,30–58` | sessions 재귀 경로와 ID 접미사, task_started/task_complete/turn_aborted, token_usage_record.turn_token_usage, token_count.info.total_token_usage, source.subagent.thread_spawn.parent_thread_id. 이름/순서 변경이 누락으로 처리될 수 있음(S6). |
| Superpowers 내부 스크립트·프롬프트 | `plugin/scripts/codex-task.mjs:82–103,109–115,153–198`; `plugin/scripts/lib/task-prompt.mjs:9–43` | sdd-workspace/task-brief/review-package의 인자 및 `wrote <path>: ...` 출력, 첫 fenced block의 prompt 본문, 대괄호 자리표시자, `Task N`, `Spec`, `Global Constraints` 표기. |
| Python 내부 함수 | `plugin/scripts/sandbox-python/sitecustomize.py:13–36` | _sanitize_params의 4개 반환값, _get_candidate_names, TMP_MAX, mkdtemp의 의미. 함수 존재만으로 시그니처/행동 호환이 보장되지는 않음. |

### M1. 변경된 검수 템플릿의 남은 자리표시자를 검사하지 않음

- **심각도:** 중간.
- **위치:** `plugin/scripts/lib/task-prompt.mjs:5–7,29–38`, `plugin/scripts/codex-task.mjs:159–202,238–240`.
- **문제:** 작업 프롬프트는 알려지지 않은 `{{...}}`를 검사하지만, 외부 검수 템플릿의 `[FIELD]`는 치환 뒤 검증하지 않는다. 파서도 ‘첫 코드 블록’을 곧바로 프롬프트로 사용한다.
- **실제 상황:** 고정 버전을 갱신하면서 외부 템플릿이 새 필수 `[REQUIREMENTS_FILE]`을 추가하면 그 문자열을 남긴 채 파일을 쓰고 0/검수자 호출 안내를 출력한다. 현재 핀 버전에서 실제로 그런 미치환이 있는지는 확인 못 함이며, 버전 갱신 시의 확정된 미검증 경로다.
- **제안:** 외부 템플릿의 필수 자리표시자·본문 추출 계약을 명시적으로 검증한다. 자유 텍스트 안의 대괄호까지 무조건 오류로 삼지 말고 템플릿에서 선언된 필수 키를 기준으로 검사한다.

### M2. 버전·보고 계약·기록 형식이 여러 파일에 중복

- **심각도:** 낮음.
- **위치:** `plugin/scripts/lib/pins.mjs:6–17`; 두 스킬 `codex-planning/SKILL.md:19,40–46`, `codex-execution/SKILL.md:22,37–43`; `plugin/scripts/lib/report.mjs:3–11`; `plugin/scripts/codex-check.mjs:23–30`; 각 작업 프롬프트의 마지막 다섯 줄.
- **문제:** 버전 경로·종료 코드 설명·보고 형식을 여러 곳에서 별도로 유지한다. 이미 ‘0이면 커밋됨’ 설명과 변경 없는 DONE 동작이 다르다. 보호 경로 기본값은 settings에서 공통 지시로 전달되지만 스킬 설명·테스트의 RULES에는 별도 사본이 있다.
- **실제 상황:** 핀 버전만 올리면 JS는 새 경로를 사용해도 마스터는 두 스킬에 적힌 6.4.1 경로를 계속 사용할 수 있다. 보고 필드를 바꾸면 파서·점검·일곱 Codex 프롬프트가 서로 달라질 수 있다. 현재 버전 문자열은 서로 일치하므로 현행 설치 불일치로 단정하지 않는다.
- **제안:** 실행 상수는 pins/settings로 유지하고, 문서·프롬프트 사본에는 해당 상수와의 계약 검증을 추가한다. 스킬이 참조할 수 있는 경로 출력 명령 하나로 수동 경로 복사를 줄일 수 있다.

### M3. 점검 시간 상한과 전체 세션 검색 비용이 분산됨

- **심각도:** 낮음.
- **위치:** `plugin/scripts/codex-task.mjs:265–266`; `plugin/scripts/codex-check.mjs:178–181`; `plugin/scripts/lib/run.mjs:138,156,208`; `plugin/scripts/codex-run.mjs:48,286–295`; `plugin/scripts/lib/rollout.mjs:5–9`; `plugin/scripts/lib/subagents.mjs:33–40`.
- **문제:** codex-task는 최대 세 턴에 대한 상한을 계산하지만 codex-check는 래퍼 호출 전체를 40분으로 고정한다. turn 기본값은 30분이다. 별도로 메인 기록 재시도마다 전체 세션 트리를 다시 열거하며, 하위 탐지도 전체 트리를 다시 stat한다.
- **실제 상황:** 점검의 첫 턴이 25분, 정정이 20분 걸리는 경우 각 턴은 제한 이내인데 점검 부모가 40분에 래퍼를 중단시킨다. 장기간 세션이 누적되면 최대 10회의 재귀 열거와 자식 탐색 비용이 증가한다. 실제 지연 규모는 측정하지 않아 확인 못 함이다.
- **제안:** 최대 턴 수·감시·종료 여유의 상한 계산을 공유한다. 세션 검색은 호출 안에서 발견한 경로를 재사용하되, 날짜 제한만으로 오래된 resume 기록을 버리지 않도록 한다.

### 기타 중복·보류 항목

| 항목 | 위치 | 판단과 제안 |
|---|---|---|
| 권한·pre-push 운영/템플릿 사본 | `.claude/settings.json:1–31` ↔ `project-template/.claude/settings.json:1–31`; 양쪽 `.githooks/pre-push:1–10` | 현재 내용은 일치. **낮음:** 한쪽만 고치면 신규 프로젝트와 운영 정책이 갈라짐. 공통 의도 변경 시 양쪽 일치 검증 필요. |
| 한도 기준 숫자 | 설정 파일 :5–9 ↔ 최신 명세 :300–315 | 현재 값은 일치. 명세의 근거는 역사 기록이므로 값을 바꿀 때 측정 시점과 새 값을 함께 기록. 일반 설정 추상화를 추가할 필요는 없음. |
| 보호 파일 규칙의 `/` 포함 항목 | `plugin/scripts/lib/protected.mjs:11–12`; 구현보고 :125 | basename과 규칙 전체를 비교하므로 `foo/CLAUDE.md`는 맞지 않음. **낮음·기존 보류:** 기본 네 규칙에는 영향 없음. 프로젝트별 확장 도입 때 해결. |
| 신뢰 목록 특수 경로 | `plugin/scripts/lib/trust.mjs:8–17`; 구현보고 :124 | `\\?\` 및 드라이브 루트 TEMP는 기존 보류. **낮음:** 정리 후보 보고 누락이며 자동 삭제는 하지 않음. 현재 사용자 경로의 실제 누락은 확인 못 함. |
| 테스트의 설치 환경 의존 | `plugin/scripts/test/skills.test.mjs:73–75`, `task-prompt.test.mjs:59–67`, `codex-task.test.mjs:9–11,44` | **낮음:** 순수/모의 시험과 고정된 개인 캐시 설치를 요구하는 시험이 섞임. 새 PC에서 모듈 결함과 설치 부재를 구분하기 어렵다. 순수 계약 자료와 설치 연결부 검증을 구분해 결과에 환경 의존을 표시. |

확인 못 함으로 남기는 범위: 현재 테스트 통과 수, 실제 Codex·공식 플러그인 설치 버전/도구 목록/한도, live 권한 매칭과 hooksPath, junction을 통한 실제 삭제 및 쓰기, 외부 라이브러리 close·PID 소유권 검사, 남아 있는 브로커/임시 폴더, 이번 HEAD의 배포 후 점검과 동일 명세 재측정 결과. 이 항목을 알아내기 위한 실행이나 환경 변경은 하지 않았다.
