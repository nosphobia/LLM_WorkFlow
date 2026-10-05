---
name: codex-planning
description: 승인된 명세로 구현 계획을 만들 때 superpowers:writing-plans 대신 쓴다. Codex가 계획을 쓰고 고치며, Claude는 명세와 대조해 검수만 하고 계획을 직접 고치지 않는다.
---

# Codex 계획 작성

명세가 승인된 뒤 `superpowers:writing-plans` 대신 이 스킬로 구현 계획을 만든다. 계획은 Codex가 쓰고 고친다. Claude(마스터와 검수 서브에이전트)는 검수만 한다.

시작할 때 알린다: "llm-workflow:codex-planning으로 구현 계획을 만듭니다."

## 경로

| 이름 | 위치 |
|---|---|
| 플러그인 루트 | 이 스킬의 기본 폴더(Base directory)에서 두 단계 위 |
| 래퍼 | `<플러그인 루트>/scripts/codex-run.mjs` |
| 사용량 합계 | `<플러그인 루트>/scripts/codex-usage.mjs` |
| Superpowers 6.4.1 | `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1` |
| 계획 파일 | `docs/superpowers/plans/YYYY-MM-DD-<주제>.md` |
| 진행 기록 폴더 | `.superpowers/sdd/<계획 파일 이름에서 .md를 뺀 것>/` (실행 단계도 같은 폴더를 쓴다) |

마스터가 진행 기록 폴더에 쓰는 파일: `planning.md`(계획 단계 기록), `usage-checkpoints.md`(Claude 사용률), Codex 지시 파일, 검수 지적 파일. 이 폴더는 git이 무시한다.

## 래퍼 쓰는 법

- 항상 Bash 백그라운드 실행(`run_in_background`)으로 돌리고 끝났다는 알림을 기다린다. 짧은 간격으로 상태를 확인하지 않는다.
- 새 대화: `node <래퍼> start --cwd <저장소> --prompt-file <지시 파일> --workspace <진행 기록 폴더> --role plan`
- 이어가기: `node <래퍼> resume --cwd <저장소> --thread <대화 ID> --prompt-file <지시 파일> --workspace <진행 기록 폴더> --role plan-fix --round <N>`
- 선택: `--effort xhigh`(4~5라운드), `--timeout-min <분>`(기본 30)
- 표준 출력 한 줄 요약에 종료 코드, 대화 ID, 커밋, 결과 파일 경로가 있다. 이유(`reason`)와 Codex 보고 전체(`report`)는 결과 파일(JSON)에 있다.
- 새 대화(`start`)가 필요한데 커밋되지 않은 변경이 남아 있으면 래퍼가 시작을 거부한다(종료 코드 3). 이때는 변경을 버리거나 직접 커밋하지 않고 같은 대화를 이어간다(`resume`, 추론 강도를 올려야 하면 `--effort xhigh`). 이 선택은 `planning.md`에 `Ruling:`으로 기록한다.

| 종료 코드 | 뜻 | 처리 |
|---|---|---|
| 0 | 완료, 보고된 파일이 커밋됨 | 다음 단계로 간다 |
| 2 | Codex가 NEEDS_CONTEXT 또는 BLOCKED를 보고함 | 2단계의 3번을 따른다 |
| 3 | 호출 실패, 시간 초과, 형식 위반 정정 실패, 보고와 실제 변경 불일치 | 멈추고 사용자에게 보고한다 |
| 4 | 한도 도달 | 멈추고 사용자에게 보고한다 |
| 5 | 환경 점검 실패 (버전, 샌드박스 설정) | 멈추고 사용자에게 보고한다 |

3, 4, 5에서 Claude가 대신 계획을 쓰지 않는다. 보고에는 결과 파일의 `reason`과 대화 ID를 넣는다.

## 지시문 자리표시자

틀 파일을 읽어 자리표시자를 채운 뒤 진행 기록 폴더에 저장하고, 그 파일을 `--prompt-file`로 넘긴다.

| 자리표시자 | 값 |
|---|---|
| `{{SPEC_PATH}}` | 승인된 명세 파일 (저장소 기준 경로) |
| `{{PLAN_PATH}}` | 계획 파일 (저장소 기준 경로) |
| `{{FINDINGS_PATH}}` | 이번 라운드 지적 파일 `plan-findings-r<N>.md` |
| `{{ROUNDS_SO_FAR}}` | 지금까지 끝난 수정 라운드 수 |
| `{{FINDINGS_HISTORY_PATH}}` | 라운드별 지적 전체 `plan-findings-history.md` |
| `{{ATTEMPTS_PATH}}` | 지금까지 시도한 수정 요약 `plan-attempts.md` |

## 순서

### 1. 준비

1. 현재 브랜치가 main이면 멈추고 보고한다.
2. `node <래퍼> check --cwd <저장소>`를 돌린다. 0이 아니면 멈추고 보고한다.
3. 사용자에게 Claude 주간 사용률을 받아 `usage-checkpoints.md`에 `측정점 1 (계획 작성 직전): <날짜 시각> Claude <N>%`로 적는다. Codex 사용률은 래퍼가 자동으로 기록한다.

### 2. Codex 계획 작성

1. `plan-prompt.md`를 채워 `<진행 기록 폴더>/plan-prompt.md`로 저장한다.
2. 래퍼 `start --role plan`을 돌린다. `planning.md`에 `계획 작성: thread <대화 ID>`를 적는다.
3. 0이면 계획 파일이 커밋됐다. 2이면 결과 파일의 CONCERNS를 읽는다. 명세에서 답을 찾을 수 있으면 답을 담은 지시 파일로 같은 대화를 이어간다(`resume --role plan`). 명세에 답이 없으면 멈추고 사용자에게 묻는다.

### 3. Claude 계획 검수

1. 검수 모델을 고른다. 큰 계획이나 코드 전체가 들어간 계획은 `opus`, 작고 위험이 낮은 계획은 `sonnet`이다. 서브에이전트를 보낼 때 모델을 반드시 적는다.
2. Superpowers의 `skills/writing-plans/plan-document-reviewer-prompt.md` 틀을 채우고, 프롬프트 끝에 `plan-review-additions.md` 내용을 붙여 서브에이전트로 보낸다.
3. 결과가 Approved이고 지적이 없으면 5단계로 간다.

### 4. 수정 루프 (최대 5라운드)

한 라운드는 Codex 수정 한 번과 재검수 한 번이다.

1. 지적을 `plan-findings-r<N>.md`에 저장하고, `plan-findings-history.md`에 라운드 제목과 함께 덧붙인다.
2. 1~3라운드: `fix-prompt.md`를 채워 2단계의 대화를 이어간다(`resume --role plan-fix --round <N>`).
3. 4~5라운드: `plan-attempts.md`에 지금까지의 수정 시도를 요약하고, `handoff-prompt.md`를 채워 새 대화로 시작한다(`start --role plan-fix --round <N> --effort xhigh`). 5라운드는 4라운드의 새 대화를 이어간다(`resume ... --effort xhigh`). 4라운드에서 새 대화를 시작하면 `planning.md`에 `계획 수정: thread <새 대화 ID> (round 4)`를 적는다.
4. 재검수는 `sonnet`으로 한다. 같은 계획 검수 틀을 쓰되 끝에 다음 문장을 붙인다: "Re-review only: for each finding in <지적 파일>, decide whether it is resolved, and report only new Critical or Important problems introduced by the fix."
5. `planning.md`에 `계획 수정 <N>/5: <해결 수> 해결, <남은 수> 남음 — 커밋 <해시>`를 적는다.
6. 5라운드 뒤에도 남은 지적은 마스터가 판정해 `planning.md`에 `Ruling: <지적> — <판정과 이유> — <틀렸을 때 비용>`으로 남기고 진행한다. 어느 쪽으로 가도 추측뿐이면 멈추고 보고한다.

Claude는 계획 파일을 직접 고치지 않는다.

### 5. 사용자 계획 검토 (큰 작업만)

작업 규모는 명세 단계에서 정한다. 설계가 큰 작업 경로였으면 큰 작업이다.

- 큰 작업: 계획 요약(작업 목록), 검수 결과, `Ruling:` 목록을 보여 주고 승인을 받는다. 같은 메시지에서 Claude 주간 사용률을 받아 `usage-checkpoints.md`에 `측정점 2 (계획 검토 관문)`으로 적는다. 승인되면 실행 방식이나 worktree를 묻지 않고 `llm-workflow:codex-execution`을 부른다.
- 작은 작업: 이 관문 없이 바로 `llm-workflow:codex-execution`을 부른다.

## 하지 않는 것

- `superpowers:writing-plans`와 `superpowers:subagent-driven-development`를 부르지 않는다.
- 계획 파일을 직접 고치지 않는다. Codex 호출이 실패해도 대신 쓰지 않는다.
