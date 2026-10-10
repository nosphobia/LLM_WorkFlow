---
name: codex-execution
description: 승인된 구현 계획을 실행할 때 superpowers:subagent-driven-development 대신 쓴다. 작업마다 Codex가 구현과 모든 수정을 하고, Claude는 검수만 하며 코드를 고치지 않는다.
---

# Codex 실행

시작할 때 알린다: "llm-workflow:codex-execution으로 계획을 실행합니다."

Superpowers 6.4.1 `subagent-driven-development`의 진행 기록, 작업 지시 파일, 검수 자료 방식은 그대로 쓰고 구현자만 Codex로 바꾼다. Claude(마스터와 검수 서브에이전트)는 코드를 고치지 않는다.

기계적인 일은 작업 스크립트 `codex-task.mjs`가 한다: 지시문 채우기, 래퍼 호출과 결과 요약, 검수 자료와 검수 지시 파일, 진행 기록 줄. 마스터는 검수자 호출, 판정, 사용자 보고만 한다. 사용자에게 보내는 메시지는 프로젝트 CLAUDE.md의 소통 규칙을 따른다.

## 경로

| 이름 | 위치 |
|---|---|
| 플러그인 루트 | 이 스킬의 기본 폴더(Base directory)에서 두 단계 위 |
| 작업 스크립트 | `<플러그인 루트>/scripts/codex-task.mjs` |
| 래퍼 | `<플러그인 루트>/scripts/codex-run.mjs` |
| 사용량 합계 | `<플러그인 루트>/scripts/codex-usage.mjs` |
| Superpowers 6.4.1 (아래 `<SP>`) | `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1` |
| 진행 기록 폴더 | `bash <SP>/skills/subagent-driven-development/scripts/sdd-workspace <계획 파일>`이 출력한 폴더 |

아래의 `codex-task <동작> ...`은 `node <작업 스크립트> <동작> --cwd <저장소> --plan <계획 파일> ...`을 줄여 쓴 것이다.

## 작업 스크립트와 래퍼

- `codex-task run`은 Bash 백그라운드 실행(`run_in_background`)으로 돌리고 끝났다는 알림을 기다린다. 끝나면 출력 몇 줄(종료 코드, 상태, 커밋, 테스트, 우려, 경고, `next:`)만 읽는다. 결과 파일 전체는 필요할 때만 읽는다.
- `codex-task review`, `codex-task ledger`, `node <래퍼> limits`는 바로 돌린다(몇 초).
- `codex-task run`은 진행 기록에 다음 줄을 스스로 쓴다. 마스터가 같은 줄을 다시 쓰지 않는다.
  - `Task <N>: base`
  - `Task <N>: codex thread ...`
  - 경고 줄: `네트워크 경고:`, `위험 명령 경고:`, `하위 에이전트 경고:`, `래퍼 경고:`
- 래퍼는 Codex를 부르기 전에 한도를 확인하고, 모든 지시문 앞에 공통 규칙을 붙인다(하위 에이전트 금지, 임시 폴더, 권한, 보호 경로, 프로세스).

| 종료 코드 | 뜻 | 처리 |
|---|---|---|
| 0 | 완료, 보고된 파일이 커밋됨 | `next:`가 가리키는 검수로 간다 |
| 2 | Codex가 NEEDS_CONTEXT 또는 BLOCKED를 보고함 | 아래 "Codex가 멈췄을 때" |
| 3 | 호출 실패, 시간 초과, 형식·불일치 정정 실패, 보호 경로 변경, 프로젝트 Codex 설정 변경 | 아래 "멈출 때" |
| 4 | 한도 부족(호출 전 확인) 또는 호출 중 한도 도달 | 아래 "멈출 때" |
| 5 | 환경 점검 실패 (버전, 샌드박스 설정, 프로젝트 Codex 설정, 외부 연결 도구, 한도 기준값 없음) | 아래 "멈출 때" |

- **커밋되지 않은 변경:** 새 대화(`start`)가 필요한데 커밋되지 않은 변경이 남아 있으면 래퍼가 시작을 거부한다(종료 코드 3). 이때는 변경을 버리거나 직접 커밋하지 않고 같은 대화를 이어간다(`--thread <ID>`, 추론 강도를 올려야 하면 `--effort xhigh`). 이 선택은 `Ruling:`으로 남긴다.
- **시간 초과:** 종료 코드 3이고 이유에 "제한 시간"이 있으면 Codex가 띄운 명령이 아직 돌고 있을 수 있다. 결과의 `lateChanges`와 함께 멈추고, 사용자가 확인하기 전에는 다시 부르지 않는다.
- **보호 경로 변경:** 이유가 "보호 경로 변경"이나 "보호 파일 변경"이면 변경을 되돌리지 않고 그대로 둔 채 멈춘다. 사용자가 확인한다.
- **경고:** 네트워크, 위험 명령, 하위 에이전트, 남은 임시 항목, 저장소 최상위 새 폴더 경고에서는 멈추지 않는다. 최종 보고의 "사람 확인" 목록에 넣는다.

## 멈추는 경우와 묻는 경우

실행 중에는 사용자에게 묻지 않는다. 멈추는 경우는 다음뿐이다.

1. 작업 스크립트나 래퍼의 종료 코드 3, 4, 5.
2. 큰 문제: 되돌릴 수 없는 작업, 보안 관련 작업, 작업 공간 밖에 영향을 주는 작업(병합, push, 게시), 계획 붕괴(어느 쪽으로 가도 추측뿐인 경우).

그 밖의 모호함은 마스터가 판정하고 진행한다.
- 판정은 `codex-task ledger --text "Ruling: <결정> — <이유> — <틀렸을 때 비용>"`으로 남긴다.
- 사용자가 직접 확인해야 할 것은 `codex-task ledger --text "사람 확인: <항목>"`으로도 남긴다.

권한에 막힌 일은 우회하지 않는다. 그 일 없이 판정할 수 있으면 판정·기록하고 "사람 확인" 항목으로 넘긴다. 그 일 없이는 진행할 수 없을 때만 멈추고 묻는다.

## 멈출 때

1. `codex-task ledger --text "멈춤: <원인> — <재개 조건> — <다음 명령>"`을 쓴다. 다음 명령은 전체 인자로 쓴다. 한도 멈춤이면 재개 조건에 풀리는 시각을 쓴다.
2. 사용자에게 알린다. 첫 줄은 `[개발 중 · 큰 문제]`이고, 멈춘 이유, 재개 조건, 그리고 "조건이 풀리면 새 세션에서 '이어서 진행'이라고 입력해 주세요"를 쓴다. 오래 멈춘 뒤 같은 세션을 이어가면 대화 전체를 캐시에 다시 써야 해서 비싸다.
3. 종료 코드 3, 4, 5로 멈출 때는 Codex 브로커를 닫지 않는다. 사용자가 확인하는 동안 상태를 그대로 둔다.

## 지시문 자리표시자

작업 스크립트가 채운다. 아래는 참고용이다.

| 자리표시자 | 값 |
|---|---|
| `{{TASK_NUMBER}}` | 작업 번호 |
| `{{TASK_NAME}}` | 계획의 작업 제목 |
| `{{BRIEF_PATH}}` | 작업 지시 파일 |
| `{{SPEC_PATH}}` | 계획 머리말의 명세 파일 |
| `{{PLAN_PATH}}` | 계획 파일 |
| `{{CONTEXT}}` | `--context` 파일 내용. 이 작업의 위치 한 줄, 앞 작업에서 정해진 인터페이스와 판정, 작업 지시의 모호함에 대한 마스터의 판정. 없으면 none |
| `{{GLOBAL_CONSTRAINTS}}` | 계획의 Global Constraints 절 |
| `{{REPORT_PATH}}` | `task-<N>-report.md` (최종 수정은 `final-fix-report.md`) |
| `{{FINDINGS_PATH}}` | `--findings` 파일 |
| `{{ROUNDS_SO_FAR}}` | 라운드 - 1 |
| `{{FINDINGS_HISTORY_PATH}}` | `task-<N>-findings-history.md` |
| `{{DIFF_PATH}}` | `--diff` 파일 (검수 자료) |
| `{{CONCERNS}}` | `codex-task review --concerns` 값 |

틀 파일: `implement-prompt.md`, `fix-prompt.md`, `handoff-prompt.md`, `final-fix-prompt.md`, `review-additions.md`.

## 준비

1. 현재 브랜치가 main이면 멈추고 보고한다. worktree를 만들지 않는다.
2. `sdd-workspace`로 진행 기록 폴더를 정한다.
3. `node <래퍼> check --cwd <저장소>`를 돌린다. 0이 아니면 "멈출 때"를 따른다.
4. `node <래퍼> limits --cwd <저장소> --phase execute --tasks <남은 작업 수>`를 돌린다. 4이면 시작하지 않고 출력의 풀리는 시각과 함께 "멈출 때"를 따른다. 5이면 "멈출 때"를 따른다.
5. `progress.md`가 있으면 아래 "이어서 진행"을 따른다. 없으면 첫 줄 `# SDD ledger — plan: <계획 파일>`로 만든다.
6. 처음일 때만 충돌 점검 표를 만든다.
   - 계획과 명세를 한 번 읽는다.
   - 파일이나 인터페이스를 공유하는 작업 쌍마다 한 줄, 작업마다 한 줄씩 표를 `progress.md`에 쓴다.
   - 찾은 충돌은 명세를 기준으로 판정해 기록한다.

## 이어서 진행

새 세션에서 사용자가 "이어서 진행"이라고 하면:

1. `progress.md`를 읽는다. 충돌 점검 표가 있으면 다시 쓰지 않는다.
2. 마지막 줄이 `멈춤:`이면 재개 조건부터 확인한다.
   - 한도 멈춤이면 `node <래퍼> limits --cwd <저장소> --phase call`을 돌리고, 4면 다시 멈춘다.
   - 조건이 풀렸으면 `codex-task ledger --text "재개: <시각>"`을 쓰고 멈춤 줄의 다음 명령으로 이어간다.
3. `Task <N>: complete` 줄이 있는 작업은 건너뛴다. 마지막 줄이 수정 라운드인 작업은 그 루프를 이어간다. 대화 ID는 `Task <N>: codex thread` 줄에서 찾는다.
4. `Final review:` 줄이 있으면 최종 검수를 다시 하지 않는다. `Final fix:`, `Final re-review:`, `Usage log:`, `Broker:` 줄을 보고 마무리의 다음 단계부터 한다.

## 작업마다

1. 앞 작업에서 정해진 인터페이스나 판정이 있으면 `<진행 기록 폴더>/task-<N>-context.md`에 쓴다. 앞 작업 요약을 쌓지 않는다.
2. `codex-task run --role implement --task <N> [--context <맥락 파일>]`을 백그라운드로 돌린다.
3. 종료 코드가 0이면:
   - **우려가 있을 때:** `DONE_WITH_CONCERNS`면 우려를 먼저 읽는다.
     - 정확성이나 범위에 관한 우려면, 우려를 지적으로 적은 파일로 같은 대화를 이어가 먼저 해결하게 한다: `codex-task run --role fix --task <N> --round 0 --thread <ID> --findings <파일>`. 이 처리는 수정 라운드에 세지 않는다. 끝나면 `next:`가 가리키는 작업 검수로 간다.
     - 관찰성 우려면 그대로 검수로 넘긴다.
   - **검수 지시 파일 만들기:** 출력의 `next:` 명령(`codex-task review --kind task --task <N> --base <base> --concerns "<우려 또는 none>"`)을 돌린다. 큰 변경이나 위험한 변경은 `--model opus`를 붙인다.
   - **검수자 보내기:** 출력의 모델로 검수 서브에이전트를 보낸다. 지시는 "Read <검수 지시 파일> and follow it exactly. You are read-only."이고, 서브에이전트를 보낼 때 모델을 반드시 적는다.
   - **확인할 수 없는 항목:** 검수자가 "⚠️ Cannot verify from diff"로 남긴 항목은 마스터가 직접 확인한다. 실제 빈틈이면 지적으로 다룬다.
4. 지적이 있으면 수정 루프를 돈다.
5. `codex-task ledger --text "Task <N>: complete (commits <base7>..<head7>, review clean)"`을 쓴다. 보류한 지적이 있으면 `(…, <K> parked)`로 쓴다.

Codex 작업은 한 번에 하나만 돌린다.

## Codex가 멈췄을 때 (종료 코드 2)

- **NEEDS_CONTEXT:** 필요한 맥락을 맥락 파일에 담아 같은 대화를 이어간다: `codex-task run --role implement --task <N> --thread <ID> --context <파일>`.
- **BLOCKED:** 원인을 보고 한 가지를 바꾼다.
  - 맥락 문제면 맥락을 보태 이어간다.
  - 추론이 부족하면 새 대화를 `--effort xhigh`로 시작한다. 단, Codex가 남긴 커밋되지 않은 변경이 있으면 새 대화 대신 같은 대화를 `--effort xhigh`로 이어간다.
  - 작업이 너무 크면 쪼갠 범위를 판정으로 기록하고 차례로 맡긴다.
  - 계획 결함이면 판정을 기록하고, 그 판정을 맥락에 담아 다시 맡긴다.
- 수정·인계·최종 수정 호출에서 멈췄으면: 같은 역할과 같은 라운드로 같은 대화를 이어간다(`codex-task run --role <같은 역할> --task <N> --round <R> --thread <ID> --findings <파일>`). 필요한 맥락은 지적 파일에 덧붙인다(수정 틀에는 맥락 칸이 없다). 인계는 `--findings` 대신 `--diff <검수 자료>`를 쓴다. 최종 수정은 `--role final-fix --thread <ID> --findings <파일> --diff <파일>`로 이어간다(`--task`, `--round` 없음). BLOCKED이고 바꿀 것이 없으면 멈춘다.
- 같은 방식으로 다시 시도하지 않는다. Claude가 대신 구현하지 않는다.

## 수정 루프 (작업당 최대 5라운드)

- 사소한 지적은 `codex-task ledger --text "Task <N>: minor (deferred): <한 줄>"`로 남기고 루프에 넣지 않는다.
- 계획 문구가 시킨 것과 충돌하는 지적은 명세를 기준으로 판정해 기록한 뒤 진행한다.
- 나머지(명세 ❌, Critical, Important, 확인된 ⚠️)는 루프에 넣는다. 한 라운드는 Codex 수정 한 번과 수정분 재검수 한 번이다.
  1. 지적을 `task-<N>-findings-r<R>.md`에 저장하고 `task-<N>-findings-history.md`에 덧붙인다.
  2. 1~3라운드: `codex-task run --role fix --task <N> --round <R> --thread <ID> --findings <지적 파일>`.
  3. 4라운드:
     - `codex-task review --kind task --task <N> --base <base>`로 지금까지의 변경을 묶는다. 출력의 `package=` 파일이 검수 자료다.
     - `codex-task run --role handoff --task <N> --round 4 --diff <검수 자료> --effort xhigh`로 새 대화를 시작한다.
     - 5라운드는 그 새 대화를 `--role fix --round 5 --thread <새 ID> --effort xhigh`로 이어간다.
  4. 재검수: `codex-task run`의 `next:`가 가리키는 `codex-task review --kind rereview --task <N> --base <수정 전 HEAD> --findings <지적 파일>`. 작은 수정은 `--model haiku`, 그 밖에는 `sonnet`이다. 수정에서 커밋이 없으면(반박) 재검수 자료에 'No new commits'가 적힌다. 검수자는 보고서의 반박을 지적별로 판정한다. 멈추지 않는다.
  5. `codex-task ledger --text "Task <N>: fix round <R>/5 (<X> addressed, <Y> open — <지적 한 줄들>; commits <a7>..<b7>)"`.
- 5라운드 뒤 남은 지적은 마스터가 판정한다.
  - 검수자가 틀렸거나 다툼이 있으면 `Task <N>: parked — <지적> — Ruling: <이유> — <틀렸을 때 비용>`으로 보류한다.
  - 실제 문제지만 뒤 작업이 기대지 않으면 같은 형식으로 보류한다.
  - 뒤 작업이 기대는 문제면 막힘을 푸는 가장 작은 변경을 판정해 기록하고, 다음 작업 맥락에 담는다.
  - 어느 쪽으로 가도 추측뿐이면 멈춘다.
- 검수 지적에 대한 판정은 루프 상한에서만 한다.

## 마무리

1. **마스터의 테스트:** 마스터가 계획 Global Constraints의 전체 테스트 명령을 제한 시간을 두고 직접 돌린다(보정 모듈 없이, Codex 샌드박스 밖). 이 결과가 최종 판단 기준이다. 실패하면 최종 검수 지적에 넣고, 결과(명령, 통과/실패 수)를 최종 보고에 적는다.
2. **최종 검수:** `codex-task review --kind final --base $(git merge-base main HEAD)`를 돌리고, 출력대로 `opus` 서브에이전트를 보낸다. 끝나면 `codex-task ledger --text "Final review: <결과> — findings <파일 또는 none>"`.
3. **최종 수정 (지적이 있을 때, 한 번만):**
   - 지적을 `final-fix-findings.md`에 저장한다.
   - `codex-task run --role final-fix --findings <final-fix-findings.md> --diff <2번 출력의 package= 파일>`을 돌린다.
   - 재검수를 한 번만 한다: `codex-task review --kind rereview --task final --base <수정 전 HEAD> --findings <final-fix-findings.md>`, 모델은 `sonnet`.
   - 끝나면 `codex-task ledger --text "Final re-review: <결과>"`. 남은 지적은 판정해서 기록한다. 두 번째 수정은 없다.
4. **최종 보고:** 첫 줄은 `[배포 · 확인 필요]`이고, 핵심 세 줄과 `docs/reports/` 아래 보고 파일 경로를 쓴다. 보고 파일에 넣을 것:
   - "내가 내린 판정": `planning.md`와 `progress.md`의 `Ruling:` 줄 전부를 순서대로, 틀렸을 때 비용과 함께
   - "사람 확인" 체크 목록: `사람 확인:` 줄과 경고 줄(`progress.md`의 `네트워크 경고:`, `위험 명령 경고:`, `하위 에이전트 경고:`, `래퍼 경고:`, 그리고 `planning.md`의 `경고:` 줄)
   - Codex 사용량: `node <사용량 합계> <진행 기록 폴더>`의 호출 수, 실패 수, 정정 수, 토큰(메인, 하위 에이전트, 합계), 주간 한도 처음→끝
   - 사용자에게 Claude 주간 사용률을 받아 `usage-checkpoints.md`에 `측정점 3 (구현 직후)`로 적는다.
5. **사용량 기록:** `workflow/usage-log.md`에 합계 한 줄을 쓰고 커밋한다. 커밋 뒤 `codex-task ledger --text "Usage log: commit <해시>"`.
   - 날짜, 기능, 작업 규모
   - 수정 루프 횟수: 작업별 라운드 합. 최종 수정이 있었으면 1을 더한다.
   - Claude 사용량: 측정점 1 → 측정점 3
   - Codex 사용량: 합계의 주간 처음 → 끝
   - 메모: 측정점 2 값이 있으면 그 값, Codex 총 토큰
6. 진행 기록 폴더는 지우지 않는다.
7. **브로커 닫기:** Codex 작업이 모두 끝난 뒤 Codex 브로커를 닫는다: `node <래퍼> shutdown --cwd <저장소>`. 브로커는 저장소마다 하나씩 떠서 래퍼 호출이 재사용하고, 닫으면 그 저장소의 Codex 앱 서버도 함께 닫힌다.
   - 종료 코드 0: 닫았거나 닫을 브로커가 없다. `codex-task ledger --text "Broker: closed"`.
   - 종료 코드 3: 브로커가 끝나지 않았거나 종료를 확인하지 못했다. 다시 시도하거나 프로세스를 끝내지 말고, 출력의 PID와 함께 사용자에게 보고한다.
8. 이후 QA, 위키, 병합은 프로젝트 규칙을 따른다. 병합 방식 선택은 `superpowers:finishing-a-development-branch`를 쓴다.

## 하지 않는 것

- `superpowers:subagent-driven-development`, `superpowers:executing-plans`, `superpowers:writing-plans`를 부르지 않는다.
- 코드나 계획을 직접 고치지 않는다. Codex 호출이 실패해도 대신 구현하지 않는다.
- 진행 기록 폴더를 지우지 않는다.
