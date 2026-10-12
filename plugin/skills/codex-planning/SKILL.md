---
name: codex-planning
description: 승인된 명세로 구현 계획을 만들 때 superpowers:writing-plans 대신 쓴다. Codex가 계획을 쓰고 고치며, Claude는 명세와 대조해 검수만 하고 계획을 직접 고치지 않는다.
---

# Codex 계획 작성

명세가 승인된 뒤 `superpowers:writing-plans` 대신 이 스킬로 구현 계획을 만든다. 계획은 Codex가 쓰고 고친다. Claude(마스터와 검수 서브에이전트)는 검수만 한다. 사용자에게 보내는 메시지는 프로젝트 CLAUDE.md의 소통 규칙을 따른다.

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

마스터가 진행 기록 폴더에 쓰는 파일은 다음과 같다. 이 폴더는 git이 무시한다.
- `planning.md`: 계획 단계 기록
- `usage-checkpoints.md`: Claude 사용률 (측정 시험일 때만)
- Codex 지시 파일, 검수 지적 파일

## 래퍼 쓰는 법

- 항상 Bash 백그라운드 실행(`run_in_background`)으로 돌리고 끝났다는 알림을 기다린다. 짧은 간격으로 상태를 확인하지 않는다.
- 새 대화: `node <래퍼> start --cwd <저장소> --prompt-file <지시 파일> --workspace <진행 기록 폴더> --role plan`
- 이어가기: `node <래퍼> resume --cwd <저장소> --thread <대화 ID> --prompt-file <지시 파일> --workspace <진행 기록 폴더> --role plan-fix --round <N>`
- 선택: `--effort xhigh`(4~5라운드), `--timeout-min <분>`(기본 30)
- 표준 출력 한 줄 요약에 종료 코드, 대화 ID, 커밋, 토큰(하위 에이전트 포함), 하위 에이전트 수, 결과 파일 경로가 있다. 이유(`reason`), Codex 보고(`report`), 경고(`warnings`)는 결과 파일(JSON)에 있다.
- 래퍼는 Codex를 부르기 전에 한도를 확인하고, 모든 지시문 앞에 공통 규칙(하위 에이전트 금지, 임시 폴더, 권한, 보호 경로, 프로세스)을 붙인다. 지시 파일에 같은 내용을 넣지 않는다.
- **커밋되지 않은 변경:** 새 대화(`start`)가 필요한데 커밋되지 않은 변경이 남아 있으면 래퍼가 시작을 거부한다(종료 코드 3). 이때는 변경을 버리거나 직접 커밋하지 않고 같은 대화를 이어간다(`resume`, 추론 강도를 올려야 하면 `--effort xhigh`). 이 선택은 `planning.md`에 `Ruling:`으로 기록한다.
- **경고:** 결과 파일의 `warnings`(네트워크 명령, 위험 명령, 하위 에이전트, 남은 임시 항목, 저장소 최상위 새 폴더)는 멈추지 않는다. `planning.md`에 `경고: <문장>`으로 남기고 최종 보고의 "사람 확인" 목록에 넣는다.
- **시간 초과:** 종료 코드 3이고 이유에 "제한 시간"이 있으면 Codex가 띄운 명령이 아직 돌고 있을 수 있다. 래퍼는 중단 뒤 2분 동안 바뀐 파일을 결과의 `lateChanges`에 남긴다. 멈추기 전에 `git status`와 `lateChanges`를 확인해 남은 변경 목록을 멈춤 줄에 적는다. 재개 조건은 '새 세션의 이어서 진행'이다. 같은 세션에서는 다시 부르지 않는다.

| 종료 코드 | 뜻 | 처리 |
|---|---|---|
| 0 | 완료, 보고된 파일이 커밋됨 | 다음 단계로 간다 |
| 2 | Codex가 NEEDS_CONTEXT 또는 BLOCKED를 보고함 | 2단계의 3번을 따른다 |
| 3 | 호출 실패, 시간 초과, 형식 위반 정정 실패, 보고와 실제 변경 불일치, 보호 경로 변경, 프로젝트 Codex 설정 변경 | 아래 "멈출 때" |
| 4 | 한도 부족(호출 전 확인) 또는 호출 중 한도 도달 | 아래 "멈출 때" |
| 5 | 환경 점검 실패 (버전, 샌드박스 설정, 프로젝트 Codex 설정, 외부 연결 도구, 한도 기준값 없음) | 아래 "멈출 때" |

3, 4, 5에서 Claude가 대신 계획을 쓰지 않는다.

## 멈출 때

1. `planning.md`에 `멈춤: <원인> — <재개 조건> — <다음 명령>`을 쓴다. 다음 명령은 전체 인자로 쓴다. 한도 멈춤이면 재개 조건에 풀리는 시각을 쓴다.
2. 사용자에게 알린다. 첫 줄은 `[기획 · 큰 문제]`이고, 멈춘 이유, 재개 조건, 그리고 "조건이 풀리면 새 세션에서 '이어서 진행'이라고 입력해 주세요"를 쓴다. 시간 초과 멈춤이면 '이어서 진행'이 곧 재개 승인이다.

진행 알림을 포함해 사용자에게 쓰는 모든 메시지는 한국어로 쓴다. 짧은 진행 알림도 첫 줄에 단계를 표시한다. 예: `[기획] Codex가 계획을 쓰는 중입니다.`, `[개발 중] Task 2 검수를 기다리는 중입니다.`

자세한 보고(멈춤 보고 등)는 진행 기록 폴더의 `reports/`(`<진행 기록 폴더>/reports/`, git이 무시)에 쓰고 메시지에 그 경로를 적는다. 계획 작성부터 실행의 최종 보고 전까지는 `docs/reports/`에 쓰지 않는다. 커밋되지 않은 파일이 생기면 다음 Codex 호출의 보고·실제 변경 대조가 깨진다.

## 이어서 진행

새 세션에서 사용자가 "이어서 진행"이라고 하면 진행 기록 폴더를 찾는다. `progress.md`가 있으면 `llm-workflow:codex-execution`의 "이어서 진행"으로 넘어간다. 없으면 `planning.md`를 읽고 이 스킬의 해당 단계부터 한다.

1. 마지막 줄이 `멈춤:`이면 재개 조건부터 확인한다.
   - 한도 멈춤이면 `node <래퍼> limits --cwd <저장소> --phase plan`을 돌리고, 4면 다시 멈춘다.
   - 조건이 풀렸으면 `재개: <시각>`을 쓰고 멈춤 줄의 다음 명령으로 이어간다.
   - 시간 초과 멈춤이면 '이어서 진행'을 재개 승인으로 본다. `git status`를 멈춤 줄의 남은 변경 목록과 비교한다. 새로 바뀐 파일이 없고 보호 경로도 없으면 `재개:` 줄을 쓰고 같은 대화로 바로 이어간다. 남은 변경이 있으면 맥락 파일(수정 라운드면 지적 파일)에 '이전 차례가 남긴 변경: <목록>. 확인해서 이어 쓰고 CHANGED_FILES에 넣는다.'를 적는다. 멈춘 뒤 새로 바뀐 파일이 있거나(멈춘 명령이 아직 돌고 있다는 뜻) 보호 경로가 있으면 멈추고 사용자에게 묻는다.
2. **끊긴 계획 작성:** `Plan: committed` 줄이 없는데 커밋되지 않은 계획 파일이 남아 있으면(호출이 한도 등으로 끊긴 경우), `계획 작성: thread` 줄의 대화를 이어가 계획을 마무리하게 한다(`resume --role plan`). 이 선택을 `Ruling:`으로 남긴다.
3. `Plan review:` 줄이 있으면 그 검수를 다시 하지 않는다. 마지막 줄이 `계획 수정 <N>/5`면 그다음 라운드부터 한다.

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

틀 파일: `plan-prompt.md`, `fix-prompt.md`, `handoff-prompt.md`, `plan-review-additions.md`.

## 순서

### 1. 준비

1. 현재 브랜치가 main(또는 master)이면 묻지 않고 작업 브랜치 `feature/<명세 파일 이름에서 날짜와 -design을 뺀 부분>`을 만들어 옮긴다(`git switch -c`). `planning.md`에 `브랜치: <이름> (main에서 시작해 만듦)`을 남긴다.
2. `node <래퍼> check --cwd <저장소>`를 돌린다. 0이 아니면 "멈출 때"를 따른다.
3. `node <래퍼> limits --cwd <저장소> --phase plan`을 돌린다. 4면 시작하지 않고 출력의 풀리는 시각과 함께 "멈출 때"를 따른다. 5면 "멈출 때"를 따른다.
4. 명세 머리말에 `측정: 예`가 있을 때만 사용자에게 Claude 주간 사용률을 받아 `usage-checkpoints.md`에 `측정점 1 (계획 작성 직전): <날짜 시각> Claude <N>%`로 적는다. Codex 사용량은 래퍼가 자동으로 기록한다.

### 2. Codex 계획 작성

1. `plan-prompt.md`를 채워 `<진행 기록 폴더>/plan-prompt.md`로 저장한다.
2. 래퍼 `start --role plan`을 돌린다. `planning.md`에 `계획 작성: thread <대화 ID>`를 적는다.
3. 결과에 따라 처리한다.
   - 0이면 계획 파일이 커밋됐다. `planning.md`에 `Plan: committed <해시>`를 적는다.
   - 2이면 결과 파일의 CONCERNS를 읽는다. 명세에서 답을 찾을 수 있으면 답을 담은 지시 파일로 같은 대화를 이어간다(`resume --role plan`). 명세에 답이 없으면 계획 붕괴로 보고 멈춘다.

### 3. Claude 계획 검수

1. 검수 모델을 고른다. 큰 계획이나 코드 전체가 들어간 계획은 `opus`, 작고 위험이 낮은 계획은 `sonnet`이다. 서브에이전트를 보낼 때 모델을 반드시 적는다.
2. Superpowers의 `skills/writing-plans/plan-document-reviewer-prompt.md` 틀을 채우고, 프롬프트 끝에 `plan-review-additions.md` 내용을 붙여 서브에이전트로 보낸다.
3. `planning.md`에 `Plan review: <결과>`를 적는다. Approved이고 지적이 없으면 5단계로 간다.

### 4. 수정 루프 (최대 5라운드)

한 라운드는 Codex 수정 한 번과 재검수 한 번이다.

1. 지적을 `plan-findings-r<N>.md`에 저장하고, `plan-findings-history.md`에 라운드 제목과 함께 덧붙인다.
2. 1~3라운드: `fix-prompt.md`를 채워 2단계의 대화를 이어간다(`resume --role plan-fix --round <N>`).
3. 4~5라운드:
   - `plan-attempts.md`에 지금까지의 수정 시도를 요약한다.
   - `handoff-prompt.md`를 채워 새 대화로 시작한다(`start --role plan-fix --round <N> --effort xhigh`).
   - 5라운드는 4라운드의 새 대화를 이어간다(`resume ... --effort xhigh`).
   - 4라운드에서 새 대화를 시작하면 `planning.md`에 `계획 수정: thread <새 대화 ID> (round 4)`를 적는다.
4. 재검수는 `sonnet`으로 한다. 같은 계획 검수 틀을 쓰되 끝에 다음 문장을 붙인다: "Re-review only: for each finding in <지적 파일>, decide whether it is resolved, and report only new Critical or Important problems introduced by the fix."
5. `planning.md`에 `계획 수정 <N>/5: <해결 수> 해결, <남은 수> 남음 — 커밋 <해시>`를 적는다.
6. 5라운드 뒤에도 남은 지적은 마스터가 판정해 `planning.md`에 `Ruling: <지적> — <판정과 이유> — <틀렸을 때 비용>`으로 남기고 진행한다. 어느 쪽으로 가도 추측뿐이면 멈춘다.

Claude는 계획 파일을 직접 고치지 않는다.

### 5. 계획 검토 관문 (명세가 요청한 때만)

- **명세 머리말에 `계획 검토: 요청` 줄이 있으면:**
  - 계획 요약(작업 목록), 검수 결과, `Ruling:` 목록을 보여 주고 승인을 받는다(첫 줄 `[기획 · 확인 필요]`).
  - 명세 머리말에 `측정: 예`가 있을 때만 같은 메시지에서 Claude 주간 사용률을 받아 `usage-checkpoints.md`에 `측정점 2 (계획 검토 관문)`으로 적는다.
  - 승인되면 실행 방식이나 worktree를 묻지 않고 `llm-workflow:codex-execution`을 부른다.
- **그 줄이 없으면:** 관문 없이 바로 `llm-workflow:codex-execution`을 부른다. Opus 검수가 사용자 검토를 대신한다.

## 하지 않는 것

- `superpowers:writing-plans`와 `superpowers:subagent-driven-development`를 부르지 않는다.
- 계획 파일을 직접 고치지 않는다. Codex 호출이 실패해도 대신 쓰지 않는다.
