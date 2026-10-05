---
name: codex-execution
description: 승인된 구현 계획을 실행할 때 superpowers:subagent-driven-development 대신 쓴다. 작업마다 Codex가 구현과 모든 수정을 하고, Claude는 검수만 하며 코드를 고치지 않는다.
---

# Codex 실행

시작할 때 알린다: "llm-workflow:codex-execution으로 계획을 실행합니다."

Superpowers 6.4.1 `subagent-driven-development`의 진행 기록, 작업 지시 파일, 검수 자료 방식은 그대로 쓰고 구현자만 Codex로 바꾼다. Claude(마스터와 검수 서브에이전트)는 코드를 고치지 않는다.

## 경로

| 이름 | 위치 |
|---|---|
| 플러그인 루트 | 이 스킬의 기본 폴더(Base directory)에서 두 단계 위 |
| 래퍼 | `<플러그인 루트>/scripts/codex-run.mjs` |
| 사용량 합계 | `<플러그인 루트>/scripts/codex-usage.mjs` |
| Superpowers 6.4.1 (아래 `<SP>`) | `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1` |
| 진행 기록 폴더 | `bash <SP>/skills/subagent-driven-development/scripts/sdd-workspace <계획 파일>`이 출력한 폴더 |
| 작업 지시 파일 | `bash <SP>/skills/subagent-driven-development/scripts/task-brief <계획 파일> <N>` |
| 검수 자료 | `bash <SP>/skills/subagent-driven-development/scripts/review-package <계획 파일> <BASE> <HEAD>` |
| 작업 검수 틀 | `<SP>/skills/subagent-driven-development/task-reviewer-prompt.md` |
| 재검수 틀 | `<SP>/skills/subagent-driven-development/re-review-prompt.md` |
| 최종 검수 틀 | `<SP>/skills/requesting-code-review/code-reviewer.md` |

## 래퍼

쓰는 법과 종료 코드는 `llm-workflow:codex-planning`과 같다. 항상 Bash 백그라운드 실행으로 돌리고 알림을 기다린다. 역할은 `implement`, `fix`, `final-fix`이고 `--task <N>`, 수정 라운드에는 `--round <R>`을 붙인다.

| 종료 코드 | 처리 |
|---|---|
| 0 | 검수로 간다 |
| 2 | 아래 "Codex가 멈췄을 때"를 따른다 |
| 3, 4, 5 | 즉시 멈추고 결과 파일의 `reason`, 대화 ID, 진행 기록 위치를 보고한다. Claude가 대신 구현하지 않는다 |

새 대화(`start`)가 필요한데 커밋되지 않은 변경이 남아 있으면 래퍼가 시작을 거부한다(종료 코드 3). 이때는 변경을 버리거나 직접 커밋하지 않고 같은 대화를 이어간다(`resume`, 추론 강도를 올려야 하면 `--effort xhigh`). 이 선택은 `progress.md`에 `Ruling:`으로 기록한다.

## 멈추는 경우

래퍼 종료 코드 3, 4, 5. 되돌릴 수 없는 작업, 보안 관련 작업, 작업 공간 밖에 영향을 주는 작업(병합, push, 게시). 계획이 망가져 어느 쪽으로 가도 추측뿐인 경우. 그 밖의 모호함은 마스터가 판정하고 `progress.md`에 `Ruling: <결정> — <이유> — <틀렸을 때 비용>`으로 남긴 뒤 진행한다. 작업 사이에 사용자에게 묻지 않는다.

## 지시문 자리표시자

| 자리표시자 | 값 |
|---|---|
| `{{TASK_NUMBER}}` | 작업 번호 |
| `{{TASK_NAME}}` | 계획의 작업 제목 |
| `{{BRIEF_PATH}}` | 작업 지시 파일 |
| `{{SPEC_PATH}}` | 승인된 명세 파일 |
| `{{PLAN_PATH}}` | 계획 파일 |
| `{{CONTEXT}}` | 이 작업의 위치 한 줄, 앞 작업에서 정해진 인터페이스와 판정, 작업 지시의 모호함에 대한 마스터의 판정. 앞 작업 요약을 쌓아 넣지 않는다 |
| `{{GLOBAL_CONSTRAINTS}}` | 계획의 Global Constraints 절을 그대로 옮긴 것 |
| `{{REPORT_PATH}}` | 보고 파일 `task-<N>-report.md` (최종 수정은 `final-fix-report.md`) |
| `{{FINDINGS_PATH}}` | 이번 라운드 지적 파일 `task-<N>-findings-r<R>.md` (최종 수정은 `final-fix-findings.md`) |
| `{{ROUNDS_SO_FAR}}` | 지금까지 끝난 수정 라운드 수 |
| `{{FINDINGS_HISTORY_PATH}}` | 라운드별 지적 전체 `task-<N>-findings-history.md` |
| `{{DIFF_PATH}}` | 검수 자료 파일 |
| `{{CONCERNS}}` | 래퍼 결과의 CONCERNS (없으면 none) |

## 준비

1. 현재 브랜치가 main이면 멈추고 보고한다. worktree를 만들지 않는다.
2. `sdd-workspace`로 진행 기록 폴더를 정한다.
3. `node <래퍼> check --cwd <저장소>`를 돌린다. 0이 아니면 멈추고 보고한다.
4. `progress.md`가 없으면 첫 줄 `# SDD ledger — plan: <계획 파일>`로 만든다. 있으면 `Task <N>: complete` 줄이 있는 작업은 건너뛰고, 마지막 줄이 수정 라운드인 작업은 그 루프를 이어간다. 대화 ID는 `Task <N>: codex thread` 줄에서 찾는다.
5. 계획과 명세를 한 번 읽는다. 파일이나 인터페이스를 공유하는 작업 쌍마다 한 줄, 작업마다 한 줄씩 충돌 점검 표를 `progress.md`에 쓴다. 찾은 충돌은 명세를 기준으로 판정해 기록한다.

## 작업마다

1. `BASE=$(git rev-parse HEAD)`를 기록한다.
2. `task-brief`로 작업 지시 파일을 만든다.
3. `implement-prompt.md`를 채워 `task-<N>-codex-prompt.md`로 저장한다.
4. 래퍼 `start --role implement --task <N>`을 돌린다. `progress.md`에 `Task <N>: codex thread <대화 ID>`를 적는다.
5. 종료 코드 0이면:
   - `DONE_WITH_CONCERNS`면 우려를 먼저 읽는다. 정확성이나 범위에 관한 우려면 우려를 지적으로 적은 `fix-prompt.md`로 같은 대화를 이어가 먼저 해결하게 한다(`resume --role fix --task <N> --round 0`). 이 처리는 수정 라운드에 세지 않는다. 관찰성 우려면 그대로 검수로 넘긴다.
   - `review-package <계획 파일> <BASE> HEAD`로 검수 자료를 만든다.
   - 작업 검수 틀로 검수 서브에이전트를 보낸다. 모델은 기본 `sonnet`, 큰 변경이나 위험한 변경은 `opus`다. 틀의 `[REPORT_FILE]`은 `task-<N>-report.md`이고, `[GLOBAL_CONSTRAINTS]`에는 계획의 Global Constraints를 그대로 옮긴다. 프롬프트 끝에 `review-additions.md`를 채워 붙인다.
   - 검수자가 "⚠️ Cannot verify from diff"로 남긴 항목은 마스터가 직접 확인하고, 실제 빈틈이면 지적으로 다룬다.
6. 지적이 있으면 수정 루프를 돈다.
7. `progress.md`에 `Task <N>: complete (commits <base7>..<head7>, review clean)` 또는 `(…, <K> parked)`를 적는다.

Codex 작업은 한 번에 하나만 돌린다.

## Codex가 멈췄을 때 (종료 코드 2)

- NEEDS_CONTEXT: 필요한 맥락을 담은 지시 파일로 같은 대화를 이어간다(`resume --role implement --task <N>`).
- BLOCKED: 원인을 보고 한 가지를 바꾼다. 맥락 문제면 맥락을 보태 이어간다. 추론이 부족하면 같은 작업 지시와 보고 파일로 새 대화를 `--effort xhigh`로 시작한다. Codex가 남긴 커밋되지 않은 변경이 있으면 새 대화 대신 같은 대화를 `--effort xhigh`로 이어간다. 작업이 너무 크면 쪼갠 범위를 판정으로 기록하고 차례로 맡긴다. 계획 결함이면 판정을 기록하고 그 판정을 담아 다시 맡긴다.
- 같은 방식으로 다시 시도하지 않는다. Claude가 대신 구현하지 않는다.

## 수정 루프 (작업당 최대 5라운드)

- 사소한 지적은 `Task <N>: minor (deferred): <한 줄>`로 남기고 루프에 넣지 않는다.
- 계획 문구가 시킨 것과 충돌하는 지적은 명세를 기준으로 판정해 기록한 뒤 진행한다.
- 나머지(명세 ❌, Critical, Important, 확인된 ⚠️)는 루프에 넣는다. 한 라운드는 Codex 수정 한 번과 수정분 재검수 한 번이다.
  1. 지적을 `task-<N>-findings-r<R>.md`에 저장하고 `task-<N>-findings-history.md`에 덧붙인다.
  2. 1~3라운드: `fix-prompt.md`로 같은 대화를 이어간다(`resume --role fix --task <N> --round <R>`).
  3. 4~5라운드: `review-package <계획 파일> <BASE> HEAD`로 지금까지의 변경을 묶고, `handoff-prompt.md`로 새 대화를 시작한다(`start --role fix --task <N> --round 4 --effort xhigh`). 5라운드는 이 새 대화를 이어간다.
  4. 재검수: 앞 검수가 본 HEAD를 `FIX_BASE`로 `review-package <계획 파일> <FIX_BASE> HEAD`를 만들고 재검수 틀로 보낸다. 작은 수정은 `haiku`, 그 밖에는 `sonnet`이다.
  5. `progress.md`에 `Task <N>: fix round <R>/5 (<X> addressed, <Y> open — <지적 한 줄들>; commits <a7>..<b7>)`를 적는다.
- 5라운드 뒤 남은 지적은 마스터가 판정한다. 검수자가 틀렸거나 다툼이 있으면 `Task <N>: parked — <지적> — Ruling: <이유>`로 보류한다. 실제 문제지만 뒤 작업이 기대지 않으면 같은 형식으로 보류한다. 뒤 작업이 기대는 문제면 막힘을 푸는 가장 작은 변경을 판정해 기록하고 다음 작업 지시에 담는다. 어느 쪽으로 가도 추측뿐이면 멈추고 보고한다.
- 판정은 루프 상한에서만 한다.

## 마무리

1. 최종 검수: `MERGE_BASE=$(git merge-base main HEAD)`로 `review-package <계획 파일> <MERGE_BASE> HEAD`를 만들고, 최종 검수 틀로 `opus` 서브에이전트를 보낸다. `progress.md`의 `minor (deferred)`와 `parked` 줄을 함께 넘겨 병합 전에 고칠 것을 골라 달라고 한다.
2. 지적이 있으면 `final-fix-findings.md`에 저장하고 `final-fix-prompt.md`로 Codex 새 대화를 한 번만 시작한다(`start --role final-fix`). 수정분 재검수를 한 번만 한다(재검수 틀, `sonnet`). 남은 지적은 판정해서 기록한다. 두 번째 수정은 없다.
3. 최종 보고에 넣을 것:
   - "내가 내린 판정": `planning.md`와 `progress.md`의 `Ruling:` 줄 전부를 순서대로, 틀렸을 때 비용과 함께
   - Codex 사용량: `node <사용량 합계> <진행 기록 폴더>`의 호출 수, 실패 수, 정정 수, 총 토큰, 주간 한도 처음→끝
   - 사용자에게 Claude 주간 사용률을 받아 `usage-checkpoints.md`에 `측정점 3 (구현 직후)`로 적는다.
4. `workflow/usage-log.md`에 합계 한 줄을 쓰고 커밋한다: 날짜, 기능, 작업 규모, 수정 루프 횟수(작업별 라운드 합, 최종 수정이 있었으면 1을 더함), Claude 사용량(측정점 1 → 측정점 3), Codex 사용량(합계의 주간 처음 → 끝), 메모(측정점 2 값, Codex 총 토큰).
5. 진행 기록 폴더는 지우지 않는다.
6. 이후 QA, 위키, 병합은 프로젝트 규칙을 따른다. 병합 방식 선택은 `superpowers:finishing-a-development-branch`를 쓴다.

## 하지 않는 것

- `superpowers:subagent-driven-development`, `superpowers:executing-plans`, `superpowers:writing-plans`를 부르지 않는다.
- 코드나 계획을 직접 고치지 않는다. Codex 호출이 실패해도 대신 구현하지 않는다.
- 진행 기록 폴더를 지우지 않는다.
