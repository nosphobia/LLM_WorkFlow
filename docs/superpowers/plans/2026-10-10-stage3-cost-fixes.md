# 3단계 비용 개선 구현 계획

> **실행 당시 스냅샷이다.** 운영 지침으로 다시 실행하지 않는다. 현재 동작은 `plugin/`의 코드와 스킬이 기준이다. 완료 보고: `docs/reports/2026-10-11 비용 개선 구현 보고.md`. 체크박스가 갱신되지 않은 것은 미구현을 뜻하지 않는다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 래퍼와 두 스킬을 고쳐 3단계 비교 시험에서 드러난 비용 원인(대기 뒤 캐시 재작성, 마스터의 기계적인 일, Codex 하위 에이전트)을 줄이고, 안전 장치(보호 경로, 위험 명령, 외부 연결 도구, 프로젝트 Codex 설정)를 더한다.

**Architecture:** 판단 로직은 `plugin/scripts/lib/`의 작은 순수 모듈로 나누고 `node:test`로 시험한다. `run.mjs`(래퍼 처리 순서)는 새 판단을 deps로 받아 쓰고, `codex-run.mjs`가 실제 deps(파일, git, 공식 플러그인의 `CodexAppServerClient`)를 채운다. 마스터의 기계적인 일은 새 스크립트 `codex-task.mjs`가 맡고, 두 스킬은 이 스크립트와 새 규칙을 쓰도록 고친다.

**Tech Stack:** Node 24 내장 모듈만(ESM `.mjs`, `node:test`), Python 3.13(보정 모듈), Git for Windows, 공식 Codex 플러그인 1.0.4의 app-server 클라이언트, Superpowers 6.4.1 스크립트.

**Spec:** `docs/superpowers/specs/2026-10-10-stage3-cost-fixes-design.md`

## Global Constraints

- 작업 위치는 개발 worktree `D:\Work\LLM_Project\LLM_WorkFlow-dev`, 브랜치 `dev/stage3-cost-fixes`다. 운영 폴더 `D:\Work\LLM_Project\LLM_WorkFlow`는 건드리지 않는다.
- Node 24 내장 모듈만 쓴다. 새 의존성을 더하지 않는다. 모든 스크립트는 ESM `.mjs`다.
- 전체 테스트 명령: 개발 worktree 최상위에서 `node --test "plugin/scripts/test/*.test.mjs"`. 작업마다 끝에 전체 테스트를 한 번 돌린다.
- 공식 Codex 플러그인(`~/.claude/plugins/cache/openai-codex/...`)과 Superpowers 원본(`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/...`)은 읽거나 불러 쓰기만 하고 고치지 않는다.
- 단위 테스트는 실제 Codex나 네트워크를 부르지 않는다. 실제 Codex는 연결부 점검(`codex-check.mjs`)과 Task 13의 수동 확인에서만 쓴다.
- 코드 주석과 사용자에게 보이는 메시지는 한국어로, 기존 파일의 말투를 따른다. Codex에게 주는 지시문은 기존 틀처럼 영어로 쓴다.
- 종료 코드는 `EXIT`(`OK 0`, `STOPPED 2`, `FAILED 3`, `LIMIT 4`, `ENVIRONMENT 5`)만 쓴다.
- 테스트와 오래 걸리는 명령에는 제한 시간을 둔다. 프로세스는 이름으로 끝내지 않는다.
- 보호 경로 기본 목록: `.claude/`, `.githooks/`, `CLAUDE.md`, `.codex/`.
- 커밋 메시지는 영어 한 줄 제목 + 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 기존 저장소에 `.codex/`를 무시하는 규칙이 없으면, 래퍼가 설정 파일을 쓰기 전에 `.git/info/exclude`에 더해야 한다. 아니면 새 대화 시작 전 "커밋되지 않은 변경" 검사에 걸린다. (Task 13 수동 확인)
2. 같은 대화를 이어가는 호출에서 하위 에이전트를 셀 때, 이번 호출에서 생긴 기록만 세야 한다. 앞 호출의 하위 에이전트를 다시 세면 토큰이 두 번 더해진다. (Task 5 시험, Task 12 시험)
3. 위험 명령 탐지는 `apply_patch` 본문(파일 내용)과 `skill`, `SKILL.md` 같은 단어에 걸리면 안 된다. 3단계 시험 기록으로 오탐 0을 확인한다. (Task 4 시험)
4. 보호 경로 변경은 Codex가 보고하지 않은 변경도 잡아야 한다. (Task 12 시험)
5. 요금제가 설정 파일에 없으면 조용히 통과하지 말고 종료 코드 5로 멈춰야 한다. 응답에 없는 창은 제약이 없는 것으로 본다. (Task 2 시험)

## 파일 구조

| 파일 | 책임 | 작업 |
|---|---|---|
| `plugin/settings/workflow-settings.json` | 보호 경로, 요금제별 한도 기준값 | 1 |
| `plugin/scripts/lib/pins.mjs` | 플러그인 경로(`pluginPaths`), app-server 라이브러리 경로 | 1 |
| `plugin/scripts/lib/settings.mjs` | 설정 파일 해석, 단계별 필요 남은 양 | 1 |
| `plugin/scripts/lib/limits.mjs` | 한도 응답을 기준과 비교 | 2 |
| `plugin/scripts/lib/cli-args.mjs` | `limits`, `trust-report` 동작 | 2 |
| `plugin/scripts/lib/common-rules.mjs` | Codex 공통 지시 | 3 |
| `plugin/scripts/lib/rollout.mjs` | 명령 추출 함수 내보내기 | 4 |
| `plugin/scripts/lib/risky.mjs` | 위험 명령 탐지 | 4 |
| `plugin/scripts/test/fixtures/` | 3단계 시험 Codex 명령 자료와 생성 스크립트 | 4 |
| `plugin/scripts/lib/subagents.mjs` | 하위 에이전트 기록 찾기 | 5 |
| `plugin/scripts/lib/protected.mjs` | 보호 경로 대조 | 6 |
| `plugin/scripts/lib/project-config.mjs` | 프로젝트 Codex 설정 만들기와 확인, 외부 연결 도구 찾기 | 7 |
| `plugin/scripts/lib/temp-cleanup.mjs` | 임시 폴더 비우기, 저장소 최상위 새 폴더 | 8 |
| `plugin/scripts/lib/trust.mjs` | 신뢰 목록 보고 | 9 |
| `plugin/scripts/sandbox-python/sitecustomize.py` | 샌드박스용 Python 보정 모듈 | 10 |
| `plugin/scripts/lib/usage.mjs` | 하위 에이전트 토큰 합계 | 11 |
| `plugin/scripts/lib/run.mjs` | 래퍼 처리 순서에 새 판단 연결 | 12 |
| `plugin/scripts/codex-run.mjs` | 실제 deps와 새 동작 | 13 |
| `plugin/scripts/lib/task-prompt.mjs`, `plugin/scripts/codex-task.mjs` | 마스터의 기계적인 일 | 14 |
| `plugin/skills/codex-execution/SKILL.md`, `plugin/skills/codex-planning/SKILL.md` | 새 규칙과 스크립트 사용 | 15 |
| `project-template/CLAUDE.md`, `project-template/.gitignore` | 프로젝트 규칙 | 16 |
| `plugin/scripts/codex-check.mjs`, `plugin/scripts/lib/check-eval.mjs` | 연결부 점검 항목 추가 | 17 |
| 문서 | 명세 상태, 진행 보고 | 18 |

---

### Task 1: 설정 파일과 플러그인 경로

**Files:**
- Create: `plugin/settings/workflow-settings.json`
- Create: `plugin/scripts/lib/settings.mjs`
- Modify: `plugin/scripts/lib/pins.mjs`
- Test: `plugin/scripts/test/settings.test.mjs`

**Interfaces:**
- Produces: `PLUGIN_ROOT`, `pluginPaths(root?)` → `{ settingsFile, shimDir, codexTaskScript }` (pins.mjs); `defaultPaths()`에 `codexAppServerLib` 추가; `PHASES`, `parseSettings(text)` → `{ ok: true, settings } | { ok: false, error }`, `requiredRemaining(rule, phase, tasks = 0)` → number (settings.mjs)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`plugin/scripts/test/settings.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseSettings, requiredRemaining, PHASES } from "../lib/settings.mjs";
import { pluginPaths, PLUGIN_ROOT, defaultPaths } from "../lib/pins.mjs";

test("플러그인 경로는 플러그인 최상위 기준이다", () => {
  const paths = pluginPaths();
  assert.equal(paths.settingsFile, path.join(PLUGIN_ROOT, "settings", "workflow-settings.json"));
  assert.equal(paths.shimDir, path.join(PLUGIN_ROOT, "scripts", "sandbox-python"));
  assert.equal(paths.codexTaskScript, path.join(PLUGIN_ROOT, "scripts", "codex-task.mjs"));
  assert.ok(defaultPaths().codexAppServerLib.endsWith(path.join("scripts", "lib", "app-server.mjs")));
});

test("실제 설정 파일을 읽을 수 있고 보호 경로와 두 요금제 기준이 있다", () => {
  const parsed = parseSettings(fs.readFileSync(pluginPaths().settingsFile, "utf8"));
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(parsed.settings.protectedPaths, [".claude/", ".githooks/", "CLAUDE.md", ".codex/"]);
  assert.deepEqual(Object.keys(parsed.settings.limits).sort(), ["plus", "prolite"]);
  assert.deepEqual(parsed.settings.limits.plus["300"], { plan: 50, executeBase: 0, executePerTask: 18, call: 30 });
  assert.deepEqual(parsed.settings.limits.plus["10080"], { plan: 10, executeBase: 7, executePerTask: 3, call: 5 });
  assert.deepEqual(parsed.settings.limits.prolite["10080"], { plan: 5, executeBase: 5, executePerTask: 2, call: 5 });
});

test("형식이 틀린 설정은 이유와 함께 거부한다", () => {
  assert.match(parseSettings("{").error, /해석할 수 없습니다/);
  assert.match(parseSettings(JSON.stringify({ limits: {} })).error, /protectedPaths/);
  assert.match(parseSettings(JSON.stringify({ protectedPaths: ["x"] })).error, /limits/);
  const bad = { protectedPaths: ["x"], limits: { plus: { 300: { plan: 1, executeBase: 0, executePerTask: -1, call: 1 } } } };
  assert.match(parseSettings(JSON.stringify(bad)).error, /limits\.plus\.300\.executePerTask/);
});

test("단계별 필요 남은 양을 계산하고 실행 기준은 100을 넘지 않는다", () => {
  assert.deepEqual(PHASES, ["plan", "execute", "call"]);
  const rule = { plan: 50, executeBase: 7, executePerTask: 18, call: 30 };
  assert.equal(requiredRemaining(rule, "plan"), 50);
  assert.equal(requiredRemaining(rule, "call"), 30);
  assert.equal(requiredRemaining(rule, "execute", 3), 61);
  assert.equal(requiredRemaining(rule, "execute", 10), 100);
  assert.equal(requiredRemaining(rule, "execute"), 7);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/settings.test.mjs`
Expected: FAIL (`Cannot find module ... settings.mjs`)

- [ ] **Step 3: 설정 파일을 만든다**

`plugin/settings/workflow-settings.json`:

```json
{
  "protectedPaths": [".claude/", ".githooks/", "CLAUDE.md", ".codex/"],
  "limits": {
    "plus": {
      "300": { "plan": 50, "executeBase": 0, "executePerTask": 18, "call": 30 },
      "10080": { "plan": 10, "executeBase": 7, "executePerTask": 3, "call": 5 }
    },
    "prolite": {
      "10080": { "plan": 5, "executeBase": 5, "executePerTask": 2, "call": 5 }
    }
  }
}
```

- [ ] **Step 4: `settings.mjs`를 만든다**

`plugin/scripts/lib/settings.mjs`:

```js
// 워크플로우 설정 파일(plugin/settings/workflow-settings.json)을 읽고 한도 기준값을 계산한다.
// 기준값은 "그 창의 남은 양(%)이 이 값 이상이어야 한다"는 뜻이다.
export const PHASES = Object.freeze(["plan", "execute", "call"]);
const RULE_KEYS = ["plan", "executeBase", "executePerTask", "call"];

export function parseSettings(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `설정 파일을 해석할 수 없습니다: ${error.message}` };
  }
  if (!Array.isArray(data?.protectedPaths) || data.protectedPaths.some((item) => typeof item !== "string" || item === "")) {
    return { ok: false, error: "설정 파일의 protectedPaths가 문자열 목록이 아닙니다" };
  }
  if (!data.limits || typeof data.limits !== "object") return { ok: false, error: "설정 파일에 limits가 없습니다" };
  for (const [plan, windows] of Object.entries(data.limits)) {
    for (const [minutes, rule] of Object.entries(windows ?? {})) {
      for (const key of RULE_KEYS) {
        if (typeof rule?.[key] !== "number" || rule[key] < 0) {
          return { ok: false, error: `설정 파일 limits.${plan}.${minutes}.${key}가 0 이상의 수가 아닙니다` };
        }
      }
    }
  }
  return { ok: true, settings: data };
}

export function requiredRemaining(rule, phase, tasks = 0) {
  if (phase === "plan") return rule.plan;
  if (phase === "call") return rule.call;
  return Math.min(100, rule.executeBase + rule.executePerTask * Math.max(0, tasks));
}
```

- [ ] **Step 5: `pins.mjs`에 경로를 더한다**

`plugin/scripts/lib/pins.mjs`의 import 줄을 다음으로 바꾼다:

```js
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
```

`defaultPaths`의 `codexBrokerLib` 줄 아래에 한 줄을 더한다:

```js
    codexAppServerLib: path.join(cache, "openai-codex", "codex", PINS.codexPlugin.version, "scripts", "lib", "app-server.mjs"),
```

파일 끝에 더한다:

```js
// 이 플러그인의 최상위 폴더(plugin/). 설정 파일과 보정 모듈은 운영 폴더에 있어 Codex 샌드박스가 쓸 수 없다.
export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function pluginPaths(root = PLUGIN_ROOT) {
  return {
    settingsFile: path.join(root, "settings", "workflow-settings.json"),
    shimDir: path.join(root, "scripts", "sandbox-python"),
    codexTaskScript: path.join(root, "scripts", "codex-task.mjs")
  };
}
```

- [ ] **Step 6: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/settings.test.mjs`
Expected: PASS (4 tests)

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 7: 커밋한다**

```bash
git add plugin/settings/workflow-settings.json plugin/scripts/lib/settings.mjs plugin/scripts/lib/pins.mjs plugin/scripts/test/settings.test.mjs
git commit -m "feat(plugin): add the workflow settings file with limit thresholds and protected paths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 한도 판정과 `limits`, `trust-report` 인자

**Files:**
- Create: `plugin/scripts/lib/limits.mjs`
- Modify: `plugin/scripts/lib/cli-args.mjs`
- Test: `plugin/scripts/test/limits.test.mjs`, `plugin/scripts/test/cli-args.test.mjs`

**Interfaces:**
- Consumes: `requiredRemaining`, `PHASES` (Task 1)
- Produces: `pickSnapshot(response)`, `evaluateLimits(response, settings, { phase, tasks })` → `{ status: "ok" | "short" | "error", planType, reason, windows: [{ minutes, used, remaining, required, resetsAt, ok }] }`, `formatLimitLines(evaluation)` → string[]; cli-args의 새 동작 `limits`(`options.phase`, `options.tasks`)와 `trust-report`

`account/rateLimits/read` 응답 모양(2026-10-10 확인): `{ rateLimits: { planType, primary, secondary }, rateLimitsByLimitId: { codex: { planType, primary: { usedPercent, windowDurationMins, resetsAt }, secondary } } }`. `resetsAt`은 초 단위 에포크다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`plugin/scripts/test/limits.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLimits, formatLimitLines, pickSnapshot } from "../lib/limits.mjs";

const SETTINGS = {
  protectedPaths: [],
  limits: {
    plus: {
      300: { plan: 50, executeBase: 0, executePerTask: 18, call: 30 },
      10080: { plan: 10, executeBase: 7, executePerTask: 3, call: 5 }
    },
    prolite: { 10080: { plan: 5, executeBase: 5, executePerTask: 2, call: 5 } }
  }
};

const plus = (fiveHourUsed, weeklyUsed) => ({
  rateLimits: {
    planType: "plus",
    primary: { usedPercent: fiveHourUsed, windowDurationMins: 300, resetsAt: 1791600000 },
    secondary: { usedPercent: weeklyUsed, windowDurationMins: 10080, resetsAt: 1792000000 }
  }
});

const prolite = (weeklyUsed) => ({
  rateLimits: { planType: "prolite", primary: null, secondary: null },
  rateLimitsByLimitId: {
    codex: { planType: "prolite", primary: { usedPercent: weeklyUsed, windowDurationMins: 10080, resetsAt: 1792200000 }, secondary: null }
  }
});

test("codex 한도가 따로 있으면 그것을 쓴다", () => {
  assert.equal(pickSnapshot(prolite(0)).planType, "prolite");
  assert.equal(pickSnapshot(plus(1, 1)).planType, "plus");
  assert.equal(pickSnapshot({}), null);
});

test("남은 양이 기준 이상이면 ok", () => {
  const result = evaluateLimits(prolite(0), SETTINGS, { phase: "call" });
  assert.equal(result.status, "ok");
  assert.equal(result.planType, "prolite");
  assert.deepEqual(result.windows.map(({ minutes, remaining, required }) => ({ minutes, remaining, required })), [{ minutes: 10080, remaining: 100, required: 5 }]);
});

test("한 창이라도 기준 미만이면 short, 이유에 풀리는 시각이 있다", () => {
  const result = evaluateLimits(plus(60, 20), SETTINGS, { phase: "plan" });
  assert.equal(result.status, "short");
  assert.match(result.reason, /300분 창 남은 40% < 기준 50% \(풀리는 시각 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)/);
  assert.doesNotMatch(result.reason, /10080분/);
});

test("실행 전 기준은 작업 수에 따라 커진다", () => {
  assert.equal(evaluateLimits(plus(60, 20), SETTINGS, { phase: "execute", tasks: 2 }).status, "ok");
  const short = evaluateLimits(plus(60, 20), SETTINGS, { phase: "execute", tasks: 3 });
  assert.equal(short.status, "short");
  assert.match(short.reason, /기준 54%/);
});

test("설정에 없는 요금제나 창이면 error", () => {
  const team = { rateLimits: { planType: "team", primary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: null } } };
  const unknownPlan = evaluateLimits(team, SETTINGS, { phase: "call" });
  assert.equal(unknownPlan.status, "error");
  assert.match(unknownPlan.reason, /요금제 team/);
  assert.match(unknownPlan.reason, /workflow-settings\.json/);
  const extraWindow = { rateLimits: { planType: "prolite", primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: null } } };
  assert.match(evaluateLimits(extraWindow, SETTINGS, { phase: "call" }).reason, /300분 창/);
  assert.equal(evaluateLimits({}, SETTINGS, { phase: "call" }).status, "error");
  const noWindows = { rateLimits: { planType: "prolite", primary: null, secondary: null } };
  assert.match(evaluateLimits(noWindows, SETTINGS, { phase: "call" }).reason, /한도 창 정보가 없습니다/);
});

test("출력 줄에 상태와 창별 값이 있다", () => {
  const lines = formatLimitLines(evaluateLimits(plus(60, 20), SETTINGS, { phase: "plan" }));
  assert.match(lines[0], /^codex-run limits status=short plan=plus reason=/);
  assert.match(lines[1], /^window=300m used=60% remaining=40% required=50% resets=\d{4}-/);
  assert.match(lines[2], /^window=10080m used=20% remaining=80% required=10% resets=/);
});
```

`plugin/scripts/test/cli-args.test.mjs` 끝에 더한다:

```js
test("limits에는 --phase가 필요하고 --tasks는 0 이상의 정수다", () => {
  assert.match(parseCliArgs(["limits", "--cwd", repo]).error, /--phase/);
  assert.match(parseCliArgs(["limits", "--cwd", repo, "--phase", "soon"]).error, /--phase/);
  assert.match(parseCliArgs(["limits", "--cwd", repo, "--phase", "execute", "--tasks", "-1"]).error, /--tasks/);
  const parsed = parseCliArgs(["limits", "--cwd", repo, "--phase", "execute", "--tasks", "5"]);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.phase, "execute");
  assert.equal(parsed.options.tasks, 5);
  assert.equal(parseCliArgs(["limits", "--cwd", repo, "--phase", "call"]).options.tasks, 0);
});

test("trust-report는 --cwd만 있으면 된다", () => {
  const parsed = parseCliArgs(["trust-report", "--cwd", repo]);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.action, "trust-report");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/limits.test.mjs plugin/scripts/test/cli-args.test.mjs`
Expected: FAIL (limits.mjs 없음, 새 동작 거부)

- [ ] **Step 3: `limits.mjs`를 만든다**

`plugin/scripts/lib/limits.mjs`:

```js
// Codex 한도(account/rateLimits/read 응답)를 설정 파일의 기준과 비교한다. 토큰을 쓰지 않는 확인이다.
import { requiredRemaining } from "./settings.mjs";

export function pickSnapshot(response) {
  return response?.rateLimitsByLimitId?.codex ?? response?.rateLimits ?? null;
}

const formatTime = (epochSec) =>
  epochSec ? new Date(epochSec * 1000).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }) : "-";

export function evaluateLimits(response, settings, { phase, tasks = 0 }) {
  const snapshot = pickSnapshot(response);
  if (!snapshot) return { status: "error", planType: null, reason: "한도 정보를 읽지 못했습니다", windows: [] };
  const planType = snapshot.planType ?? null;
  const rules = planType ? settings.limits?.[planType] : null;
  if (!rules) {
    return {
      status: "error",
      planType,
      reason: `설정 파일에 요금제 ${planType ?? "(없음)"}의 기준값이 없습니다. 요금제를 바꿨다면 plugin/settings/workflow-settings.json에 먼저 추가하세요`,
      windows: []
    };
  }
  const windows = [];
  for (const window of [snapshot.primary, snapshot.secondary]) {
    if (!window || typeof window.usedPercent !== "number") continue;
    const minutes = window.windowDurationMins;
    const rule = rules[String(minutes)];
    if (!rule) return { status: "error", planType, reason: `설정 파일에 요금제 ${planType}의 ${minutes}분 창 기준값이 없습니다`, windows };
    const remaining = 100 - window.usedPercent;
    const required = requiredRemaining(rule, phase, tasks);
    windows.push({ minutes, used: window.usedPercent, remaining, required, resetsAt: window.resetsAt ?? null, ok: remaining >= required });
  }
  if (windows.length === 0) return { status: "error", planType, reason: "한도 창 정보가 없습니다", windows };
  const short = windows.filter((window) => !window.ok);
  if (short.length === 0) return { status: "ok", planType, reason: "한도 충분", windows };
  return {
    status: "short",
    planType,
    reason: short
      .map((window) => `${window.minutes}분 창 남은 ${window.remaining}% < 기준 ${window.required}% (풀리는 시각 ${formatTime(window.resetsAt)})`)
      .join("; "),
    windows
  };
}

export function formatLimitLines(evaluation) {
  return [
    `codex-run limits status=${evaluation.status} plan=${evaluation.planType ?? "-"} reason=${evaluation.reason}`,
    ...evaluation.windows.map(
      (window) =>
        `window=${window.minutes}m used=${window.used}% remaining=${window.remaining}% required=${window.required}% resets=${formatTime(window.resetsAt)}`
    )
  ];
}
```

- [ ] **Step 4: `cli-args.mjs`에 두 동작을 더한다**

`plugin/scripts/lib/cli-args.mjs`를 다음처럼 고친다.

import 아래에 더한다:

```js
import { PHASES } from "./settings.mjs";
```

`ACTIONS`와 첫 오류 문구를 바꾼다:

```js
const ACTIONS = ["check", "start", "resume", "shutdown", "limits", "trust-report"];
```

```js
  if (!ACTIONS.includes(action)) return fail("첫 인자는 check, start, resume, shutdown, limits, trust-report 중 하나여야 합니다");
```

`parseArgs`의 `options`에 두 항목을 더한다(`out` 아래):

```js
        phase: { type: "string" },
        tasks: { type: "string" }
```

`if (action === "check" || action === "shutdown") return { ok: true, options };` 줄을 다음으로 바꾼다:

```js
  if (action === "limits") {
    if (!PHASES.includes(values.phase)) return fail(`limits에는 --phase ${PHASES.join("|")}가 필요합니다`);
    const tasks = values.tasks === undefined ? 0 : Number(values.tasks);
    if (!(Number.isInteger(tasks) && tasks >= 0)) return fail("--tasks는 0 이상의 정수여야 합니다");
    return { ok: true, options: { ...options, phase: values.phase, tasks } };
  }
  if (action === "check" || action === "shutdown" || action === "trust-report") return { ok: true, options };
```

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/limits.test.mjs plugin/scripts/test/cli-args.test.mjs`
Expected: PASS

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 6: 커밋한다**

```bash
git add plugin/scripts/lib/limits.mjs plugin/scripts/lib/cli-args.mjs plugin/scripts/test/limits.test.mjs plugin/scripts/test/cli-args.test.mjs
git commit -m "feat(plugin): evaluate Codex rate limits against the settings and parse the limits and trust-report actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Codex 공통 지시

**Files:**
- Create: `plugin/scripts/lib/common-rules.mjs`
- Test: `plugin/scripts/test/common-rules.test.mjs`

**Interfaces:**
- Produces: `buildCommonRules(protectedPaths)` → string, `withCommonRules(prompt, protectedPaths)` → string (Task 12가 첫 차례 지시문 앞에 붙인다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`plugin/scripts/test/common-rules.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildCommonRules, withCommonRules } from "../lib/common-rules.mjs";

const PROTECTED = [".claude/", ".githooks/", "CLAUDE.md", ".codex/"];

test("공통 규칙은 하위 에이전트, 임시 폴더, 권한, 보호 경로, 프로세스를 다룬다", () => {
  const rules = buildCommonRules(PROTECTED);
  assert.match(rules, /^## Workflow rules \(always apply\)$/m);
  assert.match(rules, /Do not spawn sub-agents/);
  assert.match(rules, /Superpowers skill/);
  assert.match(rules, /default temporary directory \(TEMP\)/);
  assert.match(rules, /do not change ownership or permissions/);
  assert.match(rules, /do not retry the same action with a different command/);
  assert.match(rules, /\.claude\/, \.githooks\/, CLAUDE\.md, \.codex\//);
  assert.match(rules, /Do not terminate processes\./);
});

test("지시문 앞에 공통 규칙을 붙이고 원래 지시문은 그대로 둔다", () => {
  const prompt = "You are implementing Task 1.";
  const combined = withCommonRules(prompt, PROTECTED);
  assert.ok(combined.startsWith("## Workflow rules"));
  assert.ok(combined.endsWith(`\n\n${prompt}`));
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/common-rules.test.mjs`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: `common-rules.mjs`를 만든다**

`plugin/scripts/lib/common-rules.mjs`:

```js
// 래퍼가 모든 Codex 지시문 맨 앞에 붙이는 공통 규칙. 스킬의 지시문 틀에는 넣지 않는다(한 곳에서만 관리).
// Codex 0.160의 하위 에이전트는 설정으로 끌 수 없어 지시와 탐지로 막는다(명세 2.3절).
export function buildCommonRules(protectedPaths) {
  return [
    "## Workflow rules (always apply)",
    "- Do not spawn sub-agents or delegate work to other agents. Even if a Superpowers skill tells you to dispatch sub-agents or parallel agents, do the work yourself.",
    "- Use the default temporary directory (TEMP). Do not move temporary directories to other places inside this repository.",
    "- If a command fails because of permissions, do not change ownership or permissions (ACLs) and do not retry the same action with a different command. Write it in CONCERNS. The workflow wrapper cleans up leftover temporary folders.",
    `- Do not create or modify these protected paths: ${protectedPaths.join(", ")}.`,
    "- Do not terminate processes."
  ].join("\n");
}

export function withCommonRules(prompt, protectedPaths) {
  return `${buildCommonRules(protectedPaths)}\n\n${prompt}`;
}
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/common-rules.test.mjs`
Expected: PASS

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 5: 커밋한다**

```bash
git add plugin/scripts/lib/common-rules.mjs plugin/scripts/test/common-rules.test.mjs
git commit -m "feat(plugin): add the common rules the wrapper prepends to every Codex prompt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: 위험 명령 탐지와 3단계 시험 명령 자료

**Files:**
- Modify: `plugin/scripts/lib/rollout.mjs` (명령 추출 함수 내보내기)
- Create: `plugin/scripts/lib/risky.mjs`
- Create: `plugin/scripts/test/fixtures/make-trial-commands.mjs`
- Create: `plugin/scripts/test/fixtures/trial-commands.json` (생성 스크립트가 만든다)
- Test: `plugin/scripts/test/risky.test.mjs`

**Interfaces:**
- Produces: rollout.mjs가 `COMMAND_TYPES`(Set)와 `commandText(payload)`를 내보낸다(Task 5가 쓴다). `findRiskyCommands(commands)` → `[{ command, matches: string[] }]`. `matches`의 값은 `"프로세스 종료"`, `"권한 변경"`, `"삭제 우회"`.

**판정 규칙:**
- 명령 이름은 앞뒤가 글자, 숫자, 밑줄, 하이픈, 점이 아닐 때만 맞는다. 그래서 `skill`, `SKILL.md`, `killed`, `Kill-Switch`에는 걸리지 않는다.
- `icacls`의 플래그(`/grant`, `/setowner`, `/reset`, `/inheritance`)는 같은 명령 안에 `icacls`가 있을 때만 맞춘다.
- `*** Begin Patch`가 든 명령은 파일 수정 내용이므로 보지 않는다.

- [ ] **Step 1: rollout.mjs의 명령 추출을 내보낸다**

`plugin/scripts/lib/rollout.mjs`에서 두 선언 앞에 `export`를 붙인다:

```js
export const COMMAND_TYPES = new Set(["custom_tool_call", "function_call", "local_shell_call"]);

export function commandText(payload) {
```

(본문은 그대로 둔다.)

- [ ] **Step 2: 3단계 시험 명령 자료를 만든다**

`plugin/scripts/test/fixtures/make-trial-commands.mjs`:

```js
#!/usr/bin/env node
// 3단계 비교 시험(2026-10-07~08)의 Codex 명령 기록을 위험 명령 탐지 테스트 자료로 뽑는다. 한 번만 돌린다.
// 사용: node make-trial-commands.mjs [Codex 세션 폴더]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMMAND_TYPES, commandText } from "../../lib/rollout.mjs";

const MAIN_THREADS = [
  "01a114fe-89d2-7510-abb7-21f255e99096",
  "01a11a2e-7763-7ee0-a9b0-5d4db9069ed9",
  "01a11a33-9eea-72b2-81ba-3187891883d5",
  "01a11a37-aef8-7a61-9ae8-3121458ab8b0",
  "01a11a3d-0c02-72c0-b53e-4a13267b1b65",
  "01a11a42-c5c6-76f3-bda5-ef7eb3481c41",
  "01a11bad-79b2-7d82-868c-a64f404c9549"
];
const sessions = process.argv[2] ?? path.join(os.homedir(), ".codex", "sessions");
const files = ["2026/10/07", "2026/10/08"].flatMap((day) =>
  fs.readdirSync(path.join(sessions, day)).map((name) => path.join(sessions, day, name))
);
const parentOf = (text) => /"parent_thread_id":"([0-9a-f-]+)"/.exec(text.slice(0, 8000))?.[1] ?? null;
const picked = files
  .filter((file) => {
    if (MAIN_THREADS.some((id) => path.basename(file).endsWith(`-${id}.jsonl`))) return true;
    return MAIN_THREADS.includes(parentOf(fs.readFileSync(file, "utf8")));
  })
  .sort();
const commands = [];
for (const file of picked) {
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      continue;
    }
    if (COMMAND_TYPES.has(event.payload?.type)) commands.push(commandText(event.payload));
  }
}
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "trial-commands.json");
fs.writeFileSync(out, `${JSON.stringify({ source: "3단계 비교 시험 Codex 기록 (메인 7개 + 하위 에이전트)", files: picked.length, commands }, null, 1)}\n`);
console.log(`wrote ${out}: ${picked.length} files, ${commands.length} commands`);
```

Run: `node plugin/scripts/test/fixtures/make-trial-commands.mjs`
Expected: `wrote ...trial-commands.json: 24 files, 254 commands`

비밀 정보가 없는지 확인한다:

Run: `node -e "const t=require('fs').readFileSync('plugin/scripts/test/fixtures/trial-commands.json','utf8'); console.log((t.match(/sk-[A-Za-z0-9]{20,}|api[_-]?key\s*[:=]|password\s*[:=]|bearer\s+[A-Za-z0-9._-]{20,}/gi)||[]).length)"`
Expected: `0`. 0이 아니면 멈추고 마스터에게 보고한다(자료를 커밋하지 않는다).

- [ ] **Step 3: 실패하는 테스트를 쓴다**

`plugin/scripts/test/risky.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRiskyCommands } from "../lib/risky.mjs";

const fixtureFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "trial-commands.json");

test("위험한 명령을 종류별로 찾는다", () => {
  const cases = [
    ["taskkill /F /PID 1234", ["프로세스 종료"]],
    ["taskkill.exe /IM node.exe /F", ["프로세스 종료"]],
    ["Get-Process node | Stop-Process -Force", ["프로세스 종료"]],
    ["kill -9 4321", ["프로세스 종료"]],
    ["wmic process where name='x.exe' delete", ["프로세스 종료"]],
    ["takeown /F C:\\x", ["권한 변경"]],
    ["icacls.exe 'C:\\x' /grant 'me:(OI)(CI)F'", ["권한 변경"]],
    ["Set-Acl -Path x -AclObject $acl", ["권한 변경"]],
    ["[System.IO.Directory]::Delete('C:\\x')", ["삭제 우회"]],
    ['const r = await tools.exec_command({"cmd":"[System.IO.File]::Delete(\'a\')"})', ["삭제 우회"]]
  ];
  for (const [command, matches] of cases) {
    const found = findRiskyCommands([command]);
    assert.equal(found.length, 1, command);
    assert.deepEqual(found[0].matches, matches, command);
  }
});

test("명령 단어가 아닌 곳과 파일 수정 내용에는 걸리지 않는다", () => {
  const commands = [
    "Get-Content -Raw 'C:\\Users\\a\\.codex\\plugins\\cache\\superpowers\\skills\\using-superpowers\\SKILL.md'",
    "rg -n skill docs",
    "python -c \"print('killed')\"",
    "Write-Output Kill-Switch",
    "icacls 'C:\\x'",
    "git log --oneline",
    "*** Begin Patch\n*** Add File: notes.md\n+we must not kill processes; taskkill is banned\n*** End Patch"
  ];
  assert.deepEqual(findRiskyCommands(commands), []);
  assert.deepEqual(findRiskyCommands(undefined), []);
});

test("긴 명령은 공백을 줄이고 300자로 자른다", () => {
  const found = findRiskyCommands([`taskkill   /PID 1 ${"x".repeat(400)}`]);
  assert.equal(found[0].command.length, 300);
  assert.ok(found[0].command.startsWith("taskkill /PID 1 x"));
});

test("3단계 시험의 Codex 명령 기록에서는 이미 아는 두 건만 찾는다 (오탐 0)", () => {
  const fixture = JSON.parse(fs.readFileSync(fixtureFile, "utf8"));
  assert.equal(fixture.commands.length, 254);
  const found = findRiskyCommands(fixture.commands);
  assert.equal(found.length, 2, JSON.stringify(found, null, 1));
  const byKind = Object.fromEntries(found.map((item) => [item.matches.join(","), item.command]));
  assert.match(byKind["삭제 우회"], /\[System\.IO\.Directory\]::Delete/);
  assert.match(byKind["권한 변경"], /takeown\.exe/);
});
```

- [ ] **Step 4: 실패를 확인한다**

Run: `node --test plugin/scripts/test/risky.test.mjs`
Expected: FAIL (risky.mjs 없음)

- [ ] **Step 5: `risky.mjs`를 만든다**

`plugin/scripts/lib/risky.mjs`:

```js
// Codex가 실행한 명령에서 위험한 명령(프로세스 종료, 권한 변경, 삭제 우회)을 찾는다. 경고만 하고 실패로 처리하지 않는다.
// 명령 이름은 앞뒤가 글자·숫자·밑줄·하이픈·점이 아닐 때만 맞춘다. Codex는 호출마다 스킬 파일을 읽으므로 "skill", "SKILL.md"에 걸리면 안 된다.
const B = String.raw`(?<![\w.-])`;
const E = String.raw`(?![\w-])`;

const PATTERNS = [
  {
    name: "프로세스 종료",
    re: new RegExp(
      String.raw`${B}(?:taskkill|pkill|kill)(?:\.exe)?${E}|${B}Stop-Process${E}|${B}wmic(?:\.exe)?${E}[^\n;|&]*?${B}delete${E}`,
      "i"
    )
  },
  {
    name: "권한 변경",
    re: new RegExp(
      String.raw`${B}takeown(?:\.exe)?${E}|${B}icacls(?:\.exe)?${E}[^\n;|&]*?\/(?:grant|setowner|reset|inheritance)\b|${B}Set-Acl${E}|${B}cacls(?:\.exe)?${E}`,
      "i"
    )
  },
  { name: "삭제 우회", re: /\[System\.IO\.(?:Directory|File)\]::Delete\b/i }
];

export function findRiskyCommands(commands) {
  const found = [];
  for (const raw of commands ?? []) {
    const text = String(raw ?? "");
    // 파일 수정 내용(apply_patch 본문)은 실행한 명령이 아니다.
    if (text.includes("*** Begin Patch")) continue;
    const matches = PATTERNS.filter((pattern) => pattern.re.test(text)).map((pattern) => pattern.name);
    if (matches.length > 0) found.push({ command: text.replace(/\s+/g, " ").trim().slice(0, 300), matches });
  }
  return found;
}
```

- [ ] **Step 6: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/risky.test.mjs`
Expected: PASS (4 tests)

자료 시험이 2건이 아닌 결과를 내면, 실패 메시지의 명령을 읽고 패턴을 좁힌다. **기대값(이미 아는 두 건)은 바꾸지 않는다.** 진짜 위험 명령이 새로 보이면 멈추고 마스터에게 보고한다.

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 7: 커밋한다**

```bash
git add plugin/scripts/lib/rollout.mjs plugin/scripts/lib/risky.mjs plugin/scripts/test/risky.test.mjs plugin/scripts/test/fixtures/make-trial-commands.mjs plugin/scripts/test/fixtures/trial-commands.json
git commit -m "feat(plugin): detect risky Codex commands at word level and pin zero false positives on the stage 3 trial record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 하위 에이전트 기록 찾기

**Files:**
- Create: `plugin/scripts/lib/subagents.mjs`
- Test: `plugin/scripts/test/subagents.test.mjs`

**Interfaces:**
- Consumes: `COMMAND_TYPES`, `commandText` (Task 4)
- Produces: `parseChildRollout(text)` → `{ threadId, parentThreadId, tokens, commands }`. `findSubagents(sessionsDir, parentThreadId, sinceMs, fsx = fs)` → 같은 모양의 배열이고, 하위의 하위도 포함한다. `sinceMs` 이전에 마지막으로 바뀐 기록은 보지 않는다(이번 호출에서 생긴 것만 센다).

하위 에이전트 기록의 첫 줄은 `{"type":"session_meta","payload":{"id":"<자기 ID>","source":{"subagent":{"thread_spawn":{"parent_thread_id":"<부모 ID>"}}}}}`이고, 토큰은 마지막 `event_msg`/`token_count`의 `info.total_token_usage`다(2026-10-09 확인).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`plugin/scripts/test/subagents.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseChildRollout, findSubagents } from "../lib/subagents.mjs";

const line = (value) => JSON.stringify(value);
const meta = (id, parent) =>
  line({ type: "session_meta", payload: { id, source: parent ? { subagent: { thread_spawn: { parent_thread_id: parent } } } : "vscode" } });
const tokens = (total) => line({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { total_tokens: total } } } });
const call = (cmd) => line({ type: "response_item", payload: { type: "custom_tool_call", input: cmd } });

test("하위 에이전트 기록에서 ID, 부모, 마지막 토큰, 명령을 읽는다", () => {
  const child = parseChildRollout([meta("c1", "p1"), call("git status"), tokens(10), "깨진 줄", call("python -m unittest"), tokens(25)].join("\n"));
  assert.deepEqual(child, { threadId: "c1", parentThreadId: "p1", tokens: { total_tokens: 25 }, commands: ["git status", "python -m unittest"] });
  assert.equal(parseChildRollout(meta("m1", null)).parentThreadId, null);
});

test("이번 호출에서 생긴 하위와 그 하위만 찾는다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-test-"));
  const day = path.join(dir, "2026", "10", "10");
  fs.mkdirSync(day, { recursive: true });
  const write = (name, text, mtimeMs) => {
    const file = path.join(day, name);
    fs.writeFileSync(file, text);
    if (mtimeMs) fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
  };
  const since = Date.now() - 60_000;
  write("rollout-a-p1.jsonl", meta("p1", null));
  write("rollout-b-c1.jsonl", [meta("c1", "p1"), tokens(5)].join("\n"));
  write("rollout-c-g1.jsonl", [meta("g1", "c1"), tokens(7)].join("\n"));
  write("rollout-d-x1.jsonl", [meta("x1", "other"), tokens(9)].join("\n"));
  write("rollout-e-old.jsonl", [meta("old", "p1"), tokens(3)].join("\n"), since - 3_600_000);
  write("notes.txt", "not a rollout");
  const found = findSubagents(dir, "p1", since);
  assert.deepEqual(found.map((child) => child.threadId).sort(), ["c1", "g1"]);
  assert.deepEqual(findSubagents(dir, null, since), []);
  assert.deepEqual(findSubagents(path.join(dir, "missing"), "p1", since), []);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/subagents.test.mjs`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: `subagents.mjs`를 만든다**

`plugin/scripts/lib/subagents.mjs`:

```js
// 한 Codex 대화가 만든 하위 에이전트 대화 기록을 찾아 토큰과 명령을 읽는다. 하위의 하위도 따라간다.
// 래퍼 기록에는 메인 대화만 남으므로, 이것이 없으면 하위 에이전트 토큰이 빠진다(3단계 시험에서 약 19.5%).
import fs from "node:fs";
import path from "node:path";
import { COMMAND_TYPES, commandText } from "./rollout.mjs";

export function parseChildRollout(text) {
  const child = { threadId: null, parentThreadId: null, tokens: null, commands: [] };
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      continue;
    }
    const payload = event.payload ?? {};
    if (event.type === "session_meta") {
      child.threadId = payload.id ?? child.threadId;
      child.parentThreadId = payload.source?.subagent?.thread_spawn?.parent_thread_id ?? child.parentThreadId;
    } else if (COMMAND_TYPES.has(payload.type)) {
      child.commands.push(commandText(payload));
    } else if (event.type === "event_msg" && payload.type === "token_count" && payload.info?.total_token_usage) {
      child.tokens = payload.info.total_token_usage;
    }
  }
  return child;
}

export function findSubagents(sessionsDir, parentThreadId, sinceMs, fsx = fs) {
  if (!parentThreadId || !fsx.existsSync(sessionsDir)) return [];
  const candidates = [];
  for (const name of fsx.readdirSync(sessionsDir, { recursive: true })) {
    const file = path.join(sessionsDir, String(name));
    if (!file.endsWith(".jsonl")) continue;
    let stat;
    try {
      stat = fsx.statSync(file);
    } catch {
      continue;
    }
    // 이번 호출 전에 끝난 기록은 앞 호출의 하위 에이전트다. 같은 대화를 이어갈 때 두 번 세지 않는다.
    if (stat.mtimeMs < sinceMs) continue;
    candidates.push(parseChildRollout(fsx.readFileSync(file, "utf8")));
  }
  const parents = new Set([parentThreadId]);
  const found = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const child of candidates) {
      if (child.threadId && child.parentThreadId && parents.has(child.parentThreadId) && !parents.has(child.threadId)) {
        parents.add(child.threadId);
        found.push(child);
        grew = true;
      }
    }
  }
  return found;
}
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/subagents.test.mjs`
Expected: PASS

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 5: 커밋한다**

```bash
git add plugin/scripts/lib/subagents.mjs plugin/scripts/test/subagents.test.mjs
git commit -m "feat(plugin): find the sub-agent rollouts a Codex call spawned, including nested ones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 보호 경로 대조

**Files:**
- Create: `plugin/scripts/lib/protected.mjs`
- Test: `plugin/scripts/test/protected.test.mjs`

**Interfaces:**
- Consumes: `normalizePath` (report.mjs, 기존)
- Produces: `findProtectedChanges(files, protectedPaths)` → 정렬된 경로 배열. 규칙이 `이름/`이면 어느 깊이의 그 폴더 아래든 걸리고, 그 밖의 규칙은 어느 깊이의 같은 이름 파일이든 걸린다. 대소문자는 가리지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`plugin/scripts/test/protected.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { findProtectedChanges } from "../lib/protected.mjs";

const RULES = [".claude/", ".githooks/", "CLAUDE.md", ".codex/"];

test("보호 경로에 걸리는 변경만 고른다", () => {
  const files = [
    ".claude/settings.json",
    "sub/.githooks/pre-push",
    "docs/CLAUDE.md",
    "CLAUDE.md",
    "claude.md",
    ".codex\\config.toml",
    "src/app.py",
    ".codexrc",
    "my.claude/x",
    "CLAUDE.md.bak"
  ];
  assert.deepEqual(findProtectedChanges(files, RULES), [".claude/settings.json", ".codex/config.toml", "CLAUDE.md", "claude.md", "docs/CLAUDE.md", "sub/.githooks/pre-push"]);
});

test("변경이 없거나 걸리지 않으면 빈 목록", () => {
  assert.deepEqual(findProtectedChanges([], RULES), []);
  assert.deepEqual(findProtectedChanges(undefined, RULES), []);
  assert.deepEqual(findProtectedChanges(["greet.py", "tests/test_greet.py"], RULES), []);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/protected.test.mjs`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: `protected.mjs`를 만든다**

`plugin/scripts/lib/protected.mjs`:

```js
// Codex가 바꾼 파일 가운데 보호 경로에 걸리는 것을 찾는다.
// "이름/" 규칙은 어느 깊이의 그 폴더 아래든, 그 밖의 규칙은 어느 깊이의 같은 이름 파일이든 걸린다. 대소문자는 가리지 않는다(Windows).
import { normalizePath } from "./report.mjs";

export function findProtectedChanges(files, protectedPaths) {
  const rules = protectedPaths.map((rule) => normalizePath(rule).toLowerCase());
  const hits = new Set();
  for (const raw of files ?? []) {
    const file = normalizePath(String(raw));
    const lower = file.toLowerCase();
    const base = lower.split("/").pop();
    const hit = rules.some((rule) => (rule.endsWith("/") ? `/${lower}`.includes(`/${rule}`) : base === rule));
    if (hit) hits.add(file);
  }
  return [...hits].sort();
}
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/protected.test.mjs`
Expected: PASS

`normalizePath`가 끝의 `/`를 지워 첫 테스트가 실패하면, `protected.mjs`에서 규칙에 `normalizePath`를 쓰지 말고 `rule.replace(/\\/g, "/").toLowerCase()`로 바꾼다.

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 5: 커밋한다**

```bash
git add plugin/scripts/lib/protected.mjs plugin/scripts/test/protected.test.mjs
git commit -m "feat(plugin): match changed files against the protected paths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: 프로젝트 Codex 설정 만들기와 확인

**Files:**
- Create: `plugin/scripts/lib/project-config.mjs`
- Test: `plugin/scripts/test/project-config.test.mjs`

**Interfaces:**
- Produces:
  - `PROJECT_CONFIG_REL`(`.codex/config.toml`의 저장소 기준 경로)
  - `codexTmpDir(repoDir)` → `<repoDir>/.superpowers/sdd/codex-tmp`
  - `buildProjectConfig({ repoDir, shimDir })` → TOML 문자열
  - `hashText(text)` → sha256 hex
  - `checkEffectiveConfig(configRead, { repoDir, shimDir })` → `{ problems: string[], projectDisabled: boolean }`
  - `findAppsTools(statusResponse)` → `{ present: boolean, tools: string[] }`

`config/read`(`includeLayers: true`) 응답 모양(2026-10-10 확인): `{ config: { features, shell_environment_policy: { set }, projects, ... }, layers: [{ name: { type: "project" | "user" | "system", ... }, disabledReason?, config }] }`. `mcpServerStatus/list` 응답: `{ data: [{ name, tools: { <도구 이름>: {...} } }] }`. 외부 연결 도구가 켜져 있으면 `name: "codex_apps"` 서버가 있다(도구 190개), 꺼져 있으면 서버가 없다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`plugin/scripts/test/project-config.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { PROJECT_CONFIG_REL, codexTmpDir, buildProjectConfig, hashText, checkEffectiveConfig, findAppsTools } from "../lib/project-config.mjs";

const repoDir = "C:\\work\\repo";
const shimDir = "D:\\plugin\\scripts\\sandbox-python";
const tmp = path.join(repoDir, ".superpowers", "sdd", "codex-tmp");

test("설정 파일 경로와 명령 전용 임시 폴더", () => {
  assert.equal(PROJECT_CONFIG_REL, path.join(".codex", "config.toml"));
  assert.equal(codexTmpDir(repoDir), tmp);
});

test("외부 연결 도구를 끄고 명령 환경을 정하는 설정을 만든다", () => {
  const text = buildProjectConfig({ repoDir, shimDir });
  assert.match(text, /^# llm-workflow 래퍼가 관리한다/);
  assert.match(text, /^\[features\]\napps = false$/m);
  assert.match(text, /^\[shell_environment_policy\]$/m);
  assert.ok(text.includes(`set = { TEMP = '${tmp}', TMP = '${tmp}', PYTHONPATH = '${shimDir}' }`));
  assert.doesNotMatch(text, /multi_agent/);
  assert.throws(() => buildProjectConfig({ repoDir: "C:\\it's", shimDir }), /쓸 수 없는 문자/);
});

test("해시는 내용이 같으면 같고 다르면 다르다", () => {
  assert.equal(hashText("a"), hashText("a"));
  assert.notEqual(hashText("a"), hashText("b"));
  assert.equal(hashText(null), hashText(""));
});

const configRead = ({ disabled = false, apps = false, set = { TEMP: tmp, TMP: tmp, PYTHONPATH: shimDir } } = {}) => ({
  config: { features: { apps }, shell_environment_policy: { set } },
  layers: [{ name: { type: "project", dotCodexFolder: path.join(repoDir, ".codex") }, ...(disabled ? { disabledReason: "add as a trusted project" } : {}) }, { name: { type: "user" } }]
});

test("실제 설정이 맞으면 문제가 없다 (경로 대소문자는 가리지 않는다)", () => {
  assert.deepEqual(checkEffectiveConfig(configRead(), { repoDir, shimDir }), { problems: [], projectDisabled: false });
  const upper = configRead({ set: { TEMP: tmp.toUpperCase(), TMP: tmp, PYTHONPATH: shimDir } });
  assert.deepEqual(checkEffectiveConfig(upper, { repoDir, shimDir }).problems, []);
});

test("프로젝트 층이 꺼졌거나 값이 다르면 문제로 알린다", () => {
  const disabled = checkEffectiveConfig(configRead({ disabled: true }), { repoDir, shimDir });
  assert.equal(disabled.projectDisabled, true);
  assert.match(disabled.problems.join("; "), /프로젝트 Codex 설정이 꺼져 있습니다/);
  assert.match(checkEffectiveConfig(configRead({ apps: true }), { repoDir, shimDir }).problems.join("; "), /features\.apps/);
  const wrongTemp = checkEffectiveConfig(configRead({ set: { TEMP: "C:\\Temp", TMP: tmp, PYTHONPATH: shimDir } }), { repoDir, shimDir });
  assert.match(wrongTemp.problems.join("; "), /명령 환경 TEMP가 다릅니다: C:\\Temp/);
  const noLayer = checkEffectiveConfig({ config: {}, layers: [] }, { repoDir, shimDir });
  assert.match(noLayer.problems.join("; "), /프로젝트 Codex 설정 층이 없습니다/);
});

test("MCP 상태에서 외부 연결 도구를 찾는다", () => {
  const on = { data: [{ name: "node_repl", tools: { js: {} } }, { name: "codex_apps", tools: { gmail_send_email: {}, google_drive_delete_file: {} } }] };
  assert.deepEqual(findAppsTools(on), { present: true, tools: ["codex_apps.gmail_send_email", "codex_apps.google_drive_delete_file"] });
  assert.deepEqual(findAppsTools({ data: [{ name: "node_repl", tools: { js: {} } }] }), { present: false, tools: [] });
  assert.deepEqual(findAppsTools({ data: [{ name: "codex_apps", toolsError: "x" }] }), { present: true, tools: [] });
  assert.deepEqual(findAppsTools(null), { present: false, tools: [] });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/project-config.test.mjs`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: `project-config.mjs`를 만든다**

`plugin/scripts/lib/project-config.mjs`:

```js
// 래퍼가 관리하는 프로젝트 Codex 설정(.codex/config.toml)을 만들고, Codex가 실제로 그 설정을 쓰는지 확인한다.
// 외부 연결 도구(features.apps)를 끄고, Codex가 실행하는 명령에만 TEMP·TMP·PYTHONPATH를 준다(명세 3절, 4절).
import crypto from "node:crypto";
import path from "node:path";

export const PROJECT_CONFIG_REL = path.join(".codex", "config.toml");

export const codexTmpDir = (repoDir) => path.join(repoDir, ".superpowers", "sdd", "codex-tmp");

// TOML 리터럴 문자열(작은따옴표)은 역슬래시를 그대로 둔다. 작은따옴표와 줄바꿈은 넣을 수 없다.
function literal(value) {
  if (value.includes("'") || /[\r\n]/.test(value)) throw new Error(`설정 값에 쓸 수 없는 문자가 있습니다: ${value}`);
  return `'${value}'`;
}

export function buildProjectConfig({ repoDir, shimDir }) {
  const tmp = codexTmpDir(repoDir);
  return [
    "# llm-workflow 래퍼가 관리한다. 직접 고치지 않는다.",
    "[features]",
    "apps = false",
    "",
    "[shell_environment_policy]",
    `set = { TEMP = ${literal(tmp)}, TMP = ${literal(tmp)}, PYTHONPATH = ${literal(shimDir)} }`,
    ""
  ].join("\n");
}

export const hashText = (text) => crypto.createHash("sha256").update(text ?? "").digest("hex");

export function checkEffectiveConfig(configRead, { repoDir, shimDir }) {
  const problems = [];
  const project = (configRead?.layers ?? []).find((layer) => layer?.name?.type === "project");
  if (!project) problems.push("프로젝트 Codex 설정 층이 없습니다");
  else if (project.disabledReason) problems.push(`프로젝트 Codex 설정이 꺼져 있습니다: ${project.disabledReason}`);
  const config = configRead?.config ?? {};
  if (config.features?.apps !== false) problems.push("외부 연결 도구(features.apps)가 꺼져 있지 않습니다");
  const set = config.shell_environment_policy?.set ?? {};
  const tmp = codexTmpDir(repoDir);
  for (const [key, want] of [["TEMP", tmp], ["TMP", tmp], ["PYTHONPATH", shimDir]]) {
    if (String(set[key] ?? "").toLowerCase() !== want.toLowerCase()) problems.push(`명령 환경 ${key}가 다릅니다: ${set[key] ?? "없음"}`);
  }
  return { problems, projectDisabled: Boolean(project?.disabledReason) };
}

export function findAppsTools(statusResponse) {
  const servers = (statusResponse?.data ?? []).filter((server) => server?.name === "codex_apps");
  return {
    present: servers.length > 0,
    tools: servers.flatMap((server) => Object.keys(server.tools ?? {}).map((tool) => `codex_apps.${tool}`)).sort()
  };
}
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/project-config.test.mjs`
Expected: PASS

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 5: 커밋한다**

```bash
git add plugin/scripts/lib/project-config.mjs plugin/scripts/test/project-config.test.mjs
git commit -m "feat(plugin): build and verify the wrapper-managed project Codex config and find apps tools

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 임시 폴더 비우기와 저장소 최상위 새 폴더

**Files:**
- Create: `plugin/scripts/lib/temp-cleanup.mjs`
- Test: `plugin/scripts/test/temp-cleanup.test.mjs`

**Interfaces:**
- Produces:
  - `emptyDir(dir, fsx = fs)` → `{ removed: string[], failed: string[] }`
  - `listRootDirs(repoDir, fsx = fs)` → 정렬된 폴더 이름 배열. `.git`, `.superpowers`, `.codex`는 뺀다.
  - `suspiciousNewDirs(before, after, changedFiles, isIgnored)` → 새로 생겼고, git이 무시하지 않으며, 그 아래에 git 변경이 하나도 없는 폴더 이름

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`plugin/scripts/test/temp-cleanup.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyDir, listRootDirs, suspiciousNewDirs } from "../lib/temp-cleanup.mjs";

test("폴더 안의 항목을 모두 지우고 이름을 돌려준다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "temp-cleanup-test-"));
  fs.mkdirSync(path.join(dir, "tmpabc", "inner"), { recursive: true });
  fs.writeFileSync(path.join(dir, "tmpabc", "inner", "f.txt"), "x");
  fs.writeFileSync(path.join(dir, "loose.txt"), "x");
  assert.deepEqual(emptyDir(dir).removed.sort(), ["loose.txt", "tmpabc"]);
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.deepEqual(emptyDir(path.join(dir, "missing")), { removed: [], failed: [] });
});

test("지우지 못한 항목은 이유와 함께 남긴다", () => {
  const fake = {
    existsSync: () => true,
    readdirSync: () => ["ok", "locked"],
    rmSync: (target) => {
      if (target.endsWith("locked")) throw Object.assign(new Error("denied"), { code: "EPERM" });
    }
  };
  assert.deepEqual(emptyDir("X", fake), { removed: ["ok"], failed: ["locked: EPERM"] });
});

test("저장소 최상위 폴더 목록은 관리용 폴더와 파일을 뺀다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "temp-cleanup-root-"));
  for (const name of [".git", ".superpowers", ".codex", "src", "tests"]) fs.mkdirSync(path.join(dir, name));
  fs.writeFileSync(path.join(dir, "README.md"), "x");
  assert.deepEqual(listRootDirs(dir), ["src", "tests"]);
});

test("새로 생겼고 git이 무시하지 않으며 변경이 없는 폴더만 수상하다", () => {
  const before = ["src"];
  const after = ["cache", "pkg", "src", "tmpabc"];
  const changed = ["pkg/__init__.py", "src/app.py"];
  const isIgnored = (name) => name === "cache/";
  assert.deepEqual(suspiciousNewDirs(before, after, changed, isIgnored), ["tmpabc"]);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/temp-cleanup.test.mjs`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: `temp-cleanup.mjs`를 만든다**

`plugin/scripts/lib/temp-cleanup.mjs`:

```js
// 호출 뒤 Codex 명령 전용 임시 폴더를 사용자 권한으로 비우고, 저장소 최상위에 새로 생긴 수상한 폴더를 찾는다.
// Python 3.13의 mkdtemp 폴더는 샌드박스 안에서는 못 지우지만 소유자인 사용자는 지울 수 있다(명세 2.4절).
import fs from "node:fs";
import path from "node:path";

export function emptyDir(dir, fsx = fs) {
  const result = { removed: [], failed: [] };
  if (!fsx.existsSync(dir)) return result;
  for (const name of fsx.readdirSync(dir)) {
    try {
      fsx.rmSync(path.join(dir, name), { recursive: true, force: true });
      result.removed.push(name);
    } catch (error) {
      result.failed.push(`${name}: ${error?.code ?? error?.message ?? error}`);
    }
  }
  return result;
}

const MANAGED = new Set([".git", ".superpowers", ".codex"]);

export function listRootDirs(repoDir, fsx = fs) {
  return fsx
    .readdirSync(repoDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !MANAGED.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

// 빈 폴더는 git 상태에 보이지 않는다. 새 폴더 아래에 git 변경이 하나도 없고 무시 대상도 아니면 경고한다.
export function suspiciousNewDirs(before, after, changedFiles, isIgnored) {
  const known = new Set(before);
  return after.filter(
    (name) => !known.has(name) && !isIgnored(`${name}/`) && !changedFiles.some((file) => file.startsWith(`${name}/`))
  );
}
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/temp-cleanup.test.mjs`
Expected: PASS

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 5: 커밋한다**

```bash
git add plugin/scripts/lib/temp-cleanup.mjs plugin/scripts/test/temp-cleanup.test.mjs
git commit -m "feat(plugin): empty the Codex temp folder after a call and flag new root folders git cannot see

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 신뢰 목록 보고

**Files:**
- Create: `plugin/scripts/lib/trust.mjs`
- Test: `plugin/scripts/test/trust.test.mjs`

**Interfaces:**
- Produces:
  - `findWorkflowTrustEntries(projects, tmpDir, exists)` → `[{ path, exists, header }]`. 대상은 `tmpDir` 아래 `llm-workflow-*` 폴더 안의 항목뿐이다. Windows 경로 규칙(`path.win32`)으로 비교한다.
  - `formatTrustReport(entries)` → string[]

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`plugin/scripts/test/trust.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { findWorkflowTrustEntries, formatTrustReport } from "../lib/trust.mjs";

const projects = {
  "c:\\users\\me\\appdata\\local\\temp\\llm-workflow-check-abc\\repo": { trust_level: "trusted" },
  "c:\\users\\me\\appdata\\local\\temp\\other\\repo": { trust_level: "trusted" },
  "e:\\nosbase": { trust_level: "trusted" },
  "C:\\Users\\me\\AppData\\Local\\Temp\\llm-workflow-replay-x\\repo": { trust_level: "trusted" },
  "d:\\work\\llm_project\\usage-log-summary-codex": { trust_level: "trusted" }
};

test("임시 폴더 아래 워크플로우 항목만 고른다", () => {
  const exists = (dir) => dir.includes("check-abc");
  const entries = findWorkflowTrustEntries(projects, "C:\\Users\\me\\AppData\\Local\\Temp", exists);
  assert.deepEqual(entries, [
    { path: "C:\\Users\\me\\AppData\\Local\\Temp\\llm-workflow-replay-x\\repo", exists: false, header: "[projects.'C:\\Users\\me\\AppData\\Local\\Temp\\llm-workflow-replay-x\\repo']" },
    { path: "c:\\users\\me\\appdata\\local\\temp\\llm-workflow-check-abc\\repo", exists: true, header: "[projects.'c:\\users\\me\\appdata\\local\\temp\\llm-workflow-check-abc\\repo']" }
  ]);
  assert.deepEqual(findWorkflowTrustEntries(undefined, "C:\\Temp", () => true), []);
});

test("보고 줄은 항목마다 한 줄과 승인 안내를 담는다", () => {
  const lines = formatTrustReport([{ path: "C:\\T\\llm-workflow-a\\repo", exists: true, header: "[projects.'C:\\T\\llm-workflow-a\\repo']" }]);
  assert.match(lines[0], /^codex-run trust-report entries=1$/);
  assert.match(lines[1], /^trust exists=yes path=C:\\T\\llm-workflow-a\\repo header=\[projects\.'C:\\T\\llm-workflow-a\\repo'\]$/);
  assert.match(lines.at(-1), /사용자 승인/);
  assert.deepEqual(formatTrustReport([]).slice(0, 1), ["codex-run trust-report entries=0"]);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/trust.test.mjs`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: `trust.mjs`를 만든다**

`plugin/scripts/lib/trust.mjs`:

```js
// 사용자 Codex 설정의 신뢰 목록에서 워크플로우가 만든 임시 저장소 항목을 찾는다. 읽기만 한다.
// 사용자 Codex 설정 파일(~/.codex/config.toml)은 사용자 승인 없이 고치지 않는다(명세 3.4절).
import path from "node:path";

const win = path.win32;

export function findWorkflowTrustEntries(projects, tmpDir, exists) {
  const root = `${win.resolve(tmpDir).toLowerCase()}\\`;
  return Object.keys(projects ?? {})
    .filter((key) => {
      const full = win.resolve(key).toLowerCase();
      if (!full.startsWith(root)) return false;
      const first = full.slice(root.length).split("\\")[0];
      return first.startsWith("llm-workflow-");
    })
    .sort()
    .map((key) => ({ path: key, exists: Boolean(exists(key)), header: `[projects.'${key}']` }));
}

export function formatTrustReport(entries) {
  return [
    `codex-run trust-report entries=${entries.length}`,
    ...entries.map((entry) => `trust exists=${entry.exists ? "yes" : "no"} path=${entry.path} header=${entry.header}`),
    "위 항목을 사용자 Codex 설정(~/.codex/config.toml)에서 지우는 것은 사용자 승인을 받은 뒤에만 한다. 지우기 전에 설정 파일을 백업한다."
  ];
}
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/trust.test.mjs`
Expected: PASS

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 5: 커밋한다**

```bash
git add plugin/scripts/lib/trust.mjs plugin/scripts/test/trust.test.mjs
git commit -m "feat(plugin): report the workflow's temporary entries in the Codex trust list without changing it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 샌드박스용 Python 보정 모듈

**Files:**
- Create: `plugin/scripts/sandbox-python/sitecustomize.py`
- Test: `plugin/scripts/test/sandbox-shim.test.mjs`

**Interfaces:**
- Consumes: `pluginPaths().shimDir` (Task 1)
- Produces: Codex 명령의 PYTHONPATH에 들어가는 보정 모듈. Windows에서 `tempfile.mkdtemp`의 권한 처리만 바꿔, 새 폴더가 상위 폴더의 권한을 물려받게 한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`plugin/scripts/test/sandbox-shim.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pluginPaths } from "../lib/pins.mjs";

const version = spawnSync("python", ["-c", "import sys; print(sys.version_info >= (3, 13))"], { encoding: "utf8", timeout: 30_000 });
const skip = process.platform !== "win32" || version.status !== 0 ? "Windows와 python이 있어야 한다" : false;
const py313 = version.stdout?.trim() === "True";

// mkdtemp로 폴더를 만들고 icacls로 상속 권한((I))이 있는지 본 뒤 지운다. 출력: 함수 이름, INHERITED|PROTECTED, 지운 뒤 존재 여부
const SCRIPT = [
  "import os, shutil, subprocess, tempfile",
  "p = tempfile.mkdtemp()",
  "acl = subprocess.run(['icacls', p], capture_output=True, text=True).stdout",
  "shutil.rmtree(p)",
  "print(tempfile.mkdtemp.__name__)",
  "print('INHERITED' if '(I)' in acl else 'PROTECTED')",
  "print(os.path.exists(p))"
].join("\n");

function runPython(env) {
  return spawnSync("python", ["-c", SCRIPT], { encoding: "utf8", timeout: 60_000, env });
}

test("보정 모듈이 있으면 mkdtemp 폴더가 상위 폴더 권한을 물려받는다", { skip }, () => {
  const run = runPython({ ...process.env, PYTHONPATH: pluginPaths().shimDir });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.stdout.trim().split(/\r?\n/), ["_mkdtemp", "INHERITED", "False"]);
});

test("대조: 보정 모듈이 없으면 Python 3.13의 mkdtemp는 권한을 제한한다", { skip: skip || (!py313 && "Python 3.13 이상에서만") }, () => {
  const env = { ...process.env };
  delete env.PYTHONPATH;
  const run = runPython(env);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.stdout.trim().split(/\r?\n/), ["mkdtemp", "PROTECTED", "False"]);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/sandbox-shim.test.mjs`
Expected: 첫 테스트 FAIL (`mkdtemp`, `PROTECTED`), 대조 테스트 PASS

- [ ] **Step 3: 보정 모듈을 만든다**

`plugin/scripts/sandbox-python/sitecustomize.py`:

```python
# Codex 샌드박스 안에서만 쓰는 Python 보정 모듈. 래퍼가 프로젝트 Codex 설정으로 Codex 명령의 PYTHONPATH에만 넣는다.
# Python 3.13의 tempfile.mkdtemp는 Windows에서 새 폴더를 만든 사용자만 쓸 수 있게 권한을 제한한다(CVE-2024-4030 대응).
# 샌드박스의 제한된 권한으로는 그런 폴더를 지울 수 없어 TemporaryDirectory 정리가 늘 실패한다.
# 그래서 mkdtemp의 권한 처리만 바꿔 상위 폴더의 권한을 그대로 물려받게 한다. 이름 짓기, 재시도, 감사 이벤트는 원본과 같다.
# 필요한 내부 함수가 없는 Python이면 보정하지 않는다.
import os as _os

if _os.name == "nt":
    import errno as _errno
    import sys as _sys
    import tempfile as _tempfile

    if hasattr(_tempfile, "_sanitize_params") and hasattr(_tempfile, "_get_candidate_names"):

        def _mkdtemp(suffix=None, prefix=None, dir=None):
            prefix, suffix, dir, output_type = _tempfile._sanitize_params(prefix, suffix, dir)
            names = _tempfile._get_candidate_names()
            if output_type is bytes:
                names = map(_os.fsencode, names)
            for seq in range(_tempfile.TMP_MAX):
                name = next(names)
                file = _os.path.join(dir, prefix + name + suffix)
                _sys.audit("tempfile.mkdtemp", file)
                try:
                    _os.mkdir(file)  # 원본은 _os.mkdir(file, 0o700)
                except FileExistsError:
                    continue
                except PermissionError:
                    if _os.path.isdir(dir) and seq < _tempfile.TMP_MAX - 1:
                        continue
                    raise
                return _os.path.abspath(file)
            raise FileExistsError(_errno.EEXIST, "No usable temporary directory name found")

        _mkdtemp.__doc__ = _tempfile.mkdtemp.__doc__
        _tempfile.mkdtemp = _mkdtemp
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/sandbox-shim.test.mjs`
Expected: PASS (2 tests)

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 5: 커밋한다**

```bash
git add plugin/scripts/sandbox-python/sitecustomize.py plugin/scripts/test/sandbox-shim.test.mjs
git commit -m "feat(plugin): add the sandbox-only Python shim so mkdtemp folders inherit their parent's permissions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 사용량 합계에 하위 에이전트 더하기

**Files:**
- Modify: `plugin/scripts/lib/usage.mjs`
- Test: `plugin/scripts/test/usage.test.mjs`

**Interfaces:**
- Produces: `summarizeCalls(text)`에 `subagentCount`(합), `subagentTokens`(`sumTokens`), `totalTokens`(메인+하위 `sumTokens`), `riskyCommands`(합)가 더해진다. 호출 기록 줄의 새 필드 `subagentCount`, `subagentTokens`, `riskyCommands`는 Task 12가 쓴다. 옛 기록에는 이 필드가 없으므로 없으면 0이나 null로 본다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`plugin/scripts/test/usage.test.mjs` 끝에 더한다:

```js
test("하위 에이전트 토큰과 수, 위험 명령 수를 합친다 (옛 기록은 없는 것으로 본다)", () => {
  const lines = [
    { role: "implement", exitCode: 0, tokens: { total_tokens: 100 }, subagentCount: 2, subagentTokens: { total_tokens: 40 }, riskyCommands: 1 },
    { role: "fix", exitCode: 0, tokens: { total_tokens: 50 } }
  ].map((value) => JSON.stringify(value)).join("\n");
  const summary = summarizeCalls(lines);
  assert.equal(summary.subagentCount, 2);
  assert.equal(summary.subagentTokens.total_tokens, 40);
  assert.equal(summary.tokens.total_tokens, 150);
  assert.equal(summary.totalTokens.total_tokens, 190);
  assert.equal(summary.riskyCommands, 1);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/usage.test.mjs`
Expected: FAIL (`subagentCount` undefined)

- [ ] **Step 3: `summarizeCalls`에 필드를 더한다**

`plugin/scripts/lib/usage.mjs`의 `summarizeCalls` 반환 객체에서 `tokens:` 줄 아래에 더한다:

```js
    subagentCount: sumField(calls, "subagentCount"),
    subagentTokens: sumTokens(calls.map((call) => call.subagentTokens)),
    totalTokens: sumTokens(calls.flatMap((call) => [call.tokens, call.subagentTokens])),
    riskyCommands: sumField(calls, "riskyCommands"),
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/usage.test.mjs`
Expected: PASS

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 5: 커밋한다**

```bash
git add plugin/scripts/lib/usage.mjs plugin/scripts/test/usage.test.mjs
git commit -m "feat(plugin): include sub-agent tokens and risky command counts in the usage summary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: 래퍼 처리 순서에 새 판단 연결 (`run.mjs`)

**Files:**
- Modify: `plugin/scripts/lib/run.mjs` (전체 교체)
- Test: `plugin/scripts/test/run.test.mjs`

**Interfaces:**
- Consumes: `withCommonRules`(Task 3), `findRiskyCommands`(Task 4), `findProtectedChanges`(Task 6), `suspiciousNewDirs`(Task 8)
- Produces: `runWrapper(options, deps)`가 쓰는 새 deps (Task 13이 채운다):
  - `settings`: `{ protectedPaths }`
  - `prepareProjectConfig()`: async → `{ hash, warnings[], problems[] }`
  - `projectConfigHash()`: string
  - `checkAppsTools()`: async → `{ problems[], toolCount }`
  - `checkLimits()`: async → `{ status, reason }`
  - `listRootDirs(cwd)`: string[]
  - `isIgnored(cwd, rel)`: boolean
  - `cleanupCodexTmp()`: `{ removed, failed }`
  - `readSubagents(threadId, sinceMs)`: `[{ threadId, tokens, commands }]`
- 결과 JSON 새 필드: `riskyCommands`, `subagents`(`{ threadId, tokens }`), `tempCleanup`, `newRootDirs`, `protectedChanges`, `usage.subagentCount`, `usage.subagentTokens`, `usage.totalTokens`
- 호출 기록 줄 새 필드: `riskyCommands`(개수), `subagentCount`, `subagentTokens`, `totalTokens`
- 요약 줄: `tokens=`는 메인과 하위 에이전트의 합이고, `weekly=` 뒤에 `subagents=<수>`가 붙는다.

**처리 순서 (바뀐 부분):**
1. 환경 점검
2. 프로젝트 Codex 설정 준비와 확인. 문제가 있으면 5.
3. `check`면 외부 연결 도구를 확인하고 끝낸다. 켜져 있으면 5, 꺼져 있으면 0이고 이유에 "외부 연결 도구 N개"를 쓴다.
4. 지시 파일을 읽고, 새 대화면 커밋되지 않은 변경을 확인한다.
5. 호출 전 한도 확인: `short`면 4, `error`면 5. Codex를 부르지 않는다.
6. 저장소 최상위 폴더 목록을 기록하고 Codex를 부른다. 첫 차례에만 공통 규칙을 붙인다.
7. 차례가 끝날 때마다 프로젝트 Codex 설정 해시를 비교한다. 다르면 3.
8. (기존) 보고 형식과 변경 대조.
9. 커밋 직전 보호 경로 대조. 걸리면 3.
10. 끝낼 때(종료 코드와 상관없이 Codex를 불렀다면) 다음을 한다.
    - 하위 에이전트 찾기
    - 위험 명령·네트워크 명령 탐지
    - 임시 폴더 비우기
    - 보호 경로 변경 기록
    - 저장소 최상위 새 폴더 확인

- [ ] **Step 1: 테스트의 가짜 deps에 새 항목을 더한다**

`plugin/scripts/test/run.test.mjs`의 `setup` 안 `const base = {` 객체에서 `writeJson: ...` 줄 아래(그리고 `...deps` 위)에 더한다:

```js
    settings: { protectedPaths: [".claude/", ".githooks/", "CLAUDE.md", ".codex/"] },
    prepareProjectConfig: async () => ({ hash: "h1", warnings: [], problems: [] }),
    projectConfigHash: () => "h1",
    checkAppsTools: async () => ({ problems: [], toolCount: 0 }),
    checkLimits: async () => ({ status: "ok", reason: "한도 충분" }),
    listRootDirs: () => [],
    isIgnored: () => false,
    cleanupCodexTmp: () => ({ removed: [], failed: [] }),
    readSubagents: () => [],
```

- [ ] **Step 2: 실패하는 테스트를 더한다**

`plugin/scripts/test/run.test.mjs` 끝에 더한다:

```js
test("첫 지시문 앞에만 공통 규칙을 붙인다", async () => {
  const { run, calls } = setup({ replies: ["형식이 없는 답", DONE()] });
  await run();
  assert.match(calls.runTurn[0].prompt, /^## Workflow rules \(always apply\)/);
  assert.match(calls.runTurn[0].prompt, /\.claude\/, \.githooks\/, CLAUDE\.md, \.codex\//);
  assert.ok(calls.runTurn[0].prompt.endsWith("\n\n지시문"));
  assert.doesNotMatch(calls.runTurn[1].prompt, /Workflow rules/);
});

test("호출 전 한도가 부족하면 Codex를 부르지 않고 4", async () => {
  const { run, calls } = setup({ deps: { checkLimits: async () => ({ status: "short", reason: "10080분 창 남은 3% < 기준 5% (풀리는 시각 2026-10-17 14:08:50)" }) } });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.LIMIT);
  assert.match(result.reason, /^한도 부족\(호출 전 확인\): 10080분 창 남은 3%/);
  assert.equal(calls.runTurn.length, 0);
});

test("한도를 확인하지 못하면 Codex를 부르지 않고 5", async () => {
  const { run, calls } = setup({ deps: { checkLimits: async () => ({ status: "error", reason: "설정 파일에 요금제 team의 기준값이 없습니다" }) } });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.ENVIRONMENT);
  assert.match(result.reason, /^한도 확인 실패: 설정 파일에 요금제 team/);
  assert.equal(calls.runTurn.length, 0);
});

test("프로젝트 Codex 설정에 문제가 있으면 5, 준비 중 경고는 결과에 남긴다", async () => {
  const bad = setup({ deps: { prepareProjectConfig: async () => ({ hash: "h1", warnings: [], problems: ["외부 연결 도구(features.apps)가 꺼져 있지 않습니다"] }) } });
  const failed = await bad.run();
  assert.equal(failed.exitCode, EXIT.ENVIRONMENT);
  assert.equal(bad.calls.runTurn.length, 0);
  const warned = setup({ deps: { prepareProjectConfig: async () => ({ hash: "h1", warnings: ["프로젝트 Codex 설정을 다시 썼습니다(이전 내용과 달랐음)"], problems: [] }) } });
  const ok = await warned.run();
  assert.equal(ok.exitCode, EXIT.OK);
  assert.ok(ok.result.warnings.includes("프로젝트 Codex 설정을 다시 썼습니다(이전 내용과 달랐음)"));
});

test("호출 뒤 프로젝트 Codex 설정이 바뀌었으면 커밋하지 않고 3", async () => {
  const { run, calls } = setup({ deps: { projectConfigHash: () => "changed" } });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.equal(result.reason, "보호 파일 변경: .codex/config.toml");
  assert.equal(calls.commit.length, 0);
});

test("보호 경로를 바꿨으면 보고했든 안 했든 커밋하지 않고 3", async () => {
  const reported = setup({ replies: [DONE("greet.py, CLAUDE.md")], changed: [[], ["CLAUDE.md", "greet.py"]] });
  const first = await reported.run();
  assert.equal(first.exitCode, EXIT.FAILED);
  assert.equal(first.result.reason, "보호 경로 변경: CLAUDE.md");
  assert.deepEqual(first.result.protectedChanges, ["CLAUDE.md"]);
  assert.equal(reported.calls.commit.length, 0);

  const unreported = setup({ replies: [DONE("greet.py"), DONE("greet.py, .claude/settings.json")], changed: [[], [".claude/settings.json", "greet.py"]] });
  const second = await unreported.run();
  assert.equal(second.exitCode, EXIT.FAILED);
  assert.equal(second.result.mismatchCorrections, 1);
  assert.match(second.result.reason, /^보호 경로 변경: \.claude\/settings\.json$/);
  assert.equal(unreported.calls.commit.length, 0);
});

test("이번 호출의 하위 에이전트 토큰과 명령을 합치고 경고를 남긴다", async () => {
  const seen = [];
  const child = { threadId: "child-1", tokens: { total_tokens: 30 }, commands: ["taskkill /PID 99 /F", "curl https://example.com"] };
  const { run, calls } = setup({
    deps: {
      readSubagents: (threadId, sinceMs) => {
        seen.push({ threadId, sinceMs });
        return [child];
      }
    }
  });
  const { exitCode, result, summaryLine } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.deepEqual(seen, [{ threadId: "thread-1", sinceMs: 1_000_000 }]);
  assert.equal(result.usage.subagentCount, 1);
  assert.equal(result.usage.subagentTokens.total_tokens, 30);
  assert.equal(result.usage.totalTokens.total_tokens, 42);
  assert.deepEqual(result.subagents, [{ threadId: "child-1", tokens: { total_tokens: 30 } }]);
  assert.ok(result.warnings.includes("하위 에이전트 1개: child-1"));
  assert.ok(result.warnings.some((warning) => /^위험 명령 감지 \(프로세스 종료\): taskkill/.test(warning)));
  assert.ok(result.warnings.some((warning) => /^네트워크 명령 감지/.test(warning)));
  assert.equal(calls.lines[0].value.subagentCount, 1);
  assert.equal(calls.lines[0].value.subagentTokens.total_tokens, 30);
  assert.equal(calls.lines[0].value.totalTokens.total_tokens, 42);
  assert.equal(calls.lines[0].value.riskyCommands, 1);
  assert.match(summaryLine, /tokens=42 weekly=12%->13% subagents=1 /);
});

test("호출 뒤 임시 폴더를 정리하고, Codex 호출이 실패해도 정리한다", async () => {
  const cleaned = [];
  const cleanup = () => {
    cleaned.push(true);
    return { removed: ["tmpabc"], failed: ["tmplocked: EPERM"] };
  };
  const ok = setup({ deps: { cleanupCodexTmp: cleanup } });
  const first = await ok.run();
  assert.deepEqual(first.result.tempCleanup, { removed: ["tmpabc"], failed: ["tmplocked: EPERM"] });
  assert.ok(first.result.warnings.includes("남은 임시 항목 1개 정리: tmpabc"));
  assert.ok(first.result.warnings.includes("임시 항목 정리 실패: tmplocked: EPERM"));
  const failing = setup({ replies: [new Error("network down")], deps: { cleanupCodexTmp: cleanup } });
  const second = await failing.run();
  assert.equal(second.exitCode, EXIT.FAILED);
  assert.equal(cleaned.length, 2);
});

test("저장소 최상위에 git에 보이지 않는 새 폴더가 생기면 경고한다", async () => {
  const roots = [["src"], ["src", "tmpxyz", "pkg"]];
  const { run } = setup({ replies: [DONE("pkg/a.py")], changed: [[], ["pkg/a.py"]], deps: { listRootDirs: () => roots.shift() } });
  const { result } = await run();
  assert.deepEqual(result.newRootDirs, ["tmpxyz"]);
  assert.ok(result.warnings.includes("저장소 최상위에 git에 보이지 않는 새 폴더: tmpxyz"));
});

test("check는 외부 연결 도구가 켜져 있으면 5, 꺼져 있으면 개수를 알린다", async () => {
  const on = setup({ options: { action: "check" }, deps: { checkAppsTools: async () => ({ problems: ["외부 연결 도구가 켜져 있습니다: codex_apps 도구 190개"], toolCount: 190 }) } });
  const failed = await on.run();
  assert.equal(failed.exitCode, EXIT.ENVIRONMENT);
  assert.match(failed.result.reason, /codex_apps 도구 190개/);
  const off = setup({ options: { action: "check" } });
  const passed = await off.run();
  assert.equal(passed.exitCode, EXIT.OK);
  assert.equal(passed.result.reason, "환경 점검 통과 (외부 연결 도구 0개)");
  assert.equal(off.calls.runTurn.length, 0);
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `node --test plugin/scripts/test/run.test.mjs`
Expected: 새 테스트 FAIL, 기존 테스트 PASS

- [ ] **Step 4: `run.mjs`를 교체한다**

`plugin/scripts/lib/run.mjs` 전체를 다음으로 바꾼다:

```js
// 래퍼의 처리 순서. Codex 호출, git, 파일 입출력은 deps로 받아 테스트에서 바꿔 끼운다.
import path from "node:path";
import { EXIT, USAGE_FILE } from "./pins.mjs";
import { parseReport, isDone, buildFormatCorrection, buildMismatchCorrection } from "./report.mjs";
import { compareChangedFiles, buildCommitMessage, diffSnapshots } from "./git-changes.mjs";
import { findNetworkCommands } from "./network.mjs";
import { findRiskyCommands } from "./risky.mjs";
import { findProtectedChanges } from "./protected.mjs";
import { suspiciousNewDirs } from "./temp-cleanup.mjs";
import { withCommonRules } from "./common-rules.mjs";
import { isLimitError, weeklyPercent } from "./rollout.mjs";
import { sumTokens } from "./usage.mjs";

const CONFIG_TAMPERED = "보호 파일 변경: .codex/config.toml";

export async function runWrapper(options, deps) {
  const startedAt = deps.now();
  const state = {
    threadId: options.threadId ?? null,
    turns: [],
    corrections: 0,
    formatCorrections: 0,
    mismatchCorrections: 0,
    transientError: null,
    networkCommands: [],
    lateChanges: null,
    report: null,
    commit: null,
    warnings: [],
    codexRan: false,
    rootBefore: [],
    subagents: [],
    riskyCommands: [],
    tempCleanup: null,
    newRootDirs: [],
    protectedChanges: []
  };
  const finish = (exitCode, reason) => finalize(options, deps, state, startedAt, exitCode, reason);

  try {
    const problems = deps.checkEnvironment(options.cwd);
    if (problems.length > 0) return finish(EXIT.ENVIRONMENT, problems.join("; "));

    // 래퍼가 관리하는 프로젝트 Codex 설정을 쓰고, Codex가 그 설정을 쓰는지 토큰 없이 확인한다.
    const prepared = await deps.prepareProjectConfig();
    state.warnings.push(...(prepared.warnings ?? []));
    if (prepared.problems.length > 0) return finish(EXIT.ENVIRONMENT, prepared.problems.join("; "));

    if (options.action === "check") {
      const apps = await deps.checkAppsTools();
      if (apps.problems.length > 0) return finish(EXIT.ENVIRONMENT, apps.problems.join("; "));
      return finish(EXIT.OK, `환경 점검 통과 (외부 연결 도구 ${apps.toolCount}개)`);
    }

    const prompt = deps.readText(options.promptFile);
    if (!prompt) return finish(EXIT.FAILED, `지시 파일을 읽을 수 없습니다: ${options.promptFile}`);
    deps.ensureWorkspace(options.workspace);
    if (options.action === "start") {
      const dirty = deps.listChangedFiles(options.cwd);
      if (dirty.length > 0) return finish(EXIT.FAILED, `새 대화를 시작하기 전에 커밋되지 않은 변경이 있습니다: ${dirty.join(", ")}`);
    }

    // 호출 전 한도 확인: 호출 도중 한도에 걸려 작업이 반쯤 남는 일을 막는다.
    const limits = await deps.checkLimits();
    if (limits.status === "short") return finish(EXIT.LIMIT, `한도 부족(호출 전 확인): ${limits.reason}`);
    if (limits.status !== "ok") return finish(EXIT.ENVIRONMENT, `한도 확인 실패: ${limits.reason}`);

    state.rootBefore = deps.listRootDirs(options.cwd);
    state.codexRan = true;
    // .codex/config.toml은 git이 무시하므로 git 대조로는 바뀐 것을 알 수 없다. 해시로 따로 확인한다.
    const configChanged = () => deps.projectConfigHash() !== prepared.hash;

    const first = await runTurn(withCommonRules(prompt, deps.settings.protectedPaths), options.action === "resume" ? options.threadId : null);
    if (configChanged()) return finish(EXIT.FAILED, CONFIG_TAMPERED);
    if (first.exit !== null) return finish(first.exit, first.reason);
    if (options.action === "resume" && first.threadId !== options.threadId) {
      return finish(EXIT.FAILED, `이어간 대화 ID가 다릅니다: 요청 ${options.threadId}, 응답 ${first.threadId}`);
    }

    let report = parseReport(first.finalMessage);
    if (!report.ok) {
      state.corrections += 1;
      state.formatCorrections += 1;
      const again = await runTurn(buildFormatCorrection(report.error), state.threadId);
      if (configChanged()) return finish(EXIT.FAILED, CONFIG_TAMPERED);
      if (again.exit !== null) return finish(again.exit, again.reason);
      report = parseReport(again.finalMessage);
      if (!report.ok) return finish(EXIT.FAILED, `형식 위반 정정 실패: ${report.error}`);
    }
    state.report = report;
    if (!isDone(report.status)) return finish(EXIT.STOPPED, `Codex 보고: ${report.status}`);

    let comparison = compareChangedFiles(report.changedFiles, deps.listChangedFiles(options.cwd));
    if (!comparison.match) {
      state.corrections += 1;
      state.mismatchCorrections += 1;
      const again = await runTurn(buildMismatchCorrection(comparison), state.threadId);
      if (configChanged()) return finish(EXIT.FAILED, CONFIG_TAMPERED);
      if (again.exit !== null) return finish(again.exit, again.reason);
      report = parseReport(again.finalMessage);
      if (!report.ok) return finish(EXIT.FAILED, `보고 불일치 정정 뒤 형식 위반: ${report.error}`);
      state.report = report;
      if (!isDone(report.status)) return finish(EXIT.STOPPED, `Codex 보고: ${report.status}`);
      comparison = compareChangedFiles(report.changedFiles, deps.listChangedFiles(options.cwd));
      if (!comparison.match) {
        const missing = comparison.missing.join(", ") || "없음";
        const extra = comparison.extra.join(", ") || "없음";
        return finish(EXIT.FAILED, `보고와 실제 변경이 다릅니다 (보고에만 있음: ${missing} / 실제에만 있음: ${extra})`);
      }
    }

    // 보호 경로는 보고 여부와 상관없이 git이 보는 모든 변경과 대조한다. 걸리면 커밋하지 않고 변경은 그대로 둔다.
    const protectedHits = findProtectedChanges(deps.listChangedFiles(options.cwd), deps.settings.protectedPaths);
    if (protectedHits.length > 0) {
      state.protectedChanges = protectedHits;
      return finish(EXIT.FAILED, `보호 경로 변경: ${protectedHits.join(", ")}`);
    }

    if (report.changedFiles.length > 0) {
      const model = [...state.turns].reverse().find((turn) => turn.model)?.model ?? null;
      state.commit = deps.commitFiles(options.cwd, report.changedFiles, buildCommitMessage(report.commitMessage, model));
    }
    return finish(EXIT.OK, `Codex 보고: ${report.status}`);
  } catch (error) {
    return finish(EXIT.FAILED, `예상하지 못한 오류: ${error?.message ?? error}`);
  }

  async function runTurn(text, resumeThreadId) {
    const ids = { threadId: resumeThreadId, turnId: null };
    const onProgress = (event) => {
      if (event && typeof event === "object") {
        if (event.threadId) ids.threadId = event.threadId;
        if (event.turnId) ids.turnId = event.turnId;
      }
    };
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), options.timeoutMin * 60_000);
    });
    let outcome;
    try {
      const pending = Promise.resolve(
        deps.runTurn({ cwd: options.cwd, prompt: text, resumeThreadId, effort: options.effort, model: options.model, onProgress })
      );
      pending.catch(() => {});
      outcome = await Promise.race([pending, timeout]);
    } catch (error) {
      outcome = { thrown: true, status: 1, error: { message: String(error?.message ?? error) } };
    } finally {
      clearTimeout(timer);
    }
    if (outcome.timedOut) {
      if (ids.threadId) state.threadId = ids.threadId;
      state.interrupt = await requestInterrupt(deps, { cwd: options.cwd, threadId: ids.threadId, turnId: ids.turnId });
      // Windows에서는 Codex가 띄운 명령이 중단 뒤에도 계속 돌 수 있어, 잠시 기다린 뒤 바뀐 파일을 기록한다.
      const watchMs = deps.postTimeoutWatchMs ?? 120_000;
      let watchNote;
      try {
        const before = deps.snapshotRepo(options.cwd);
        await deps.sleep(watchMs);
        const after = deps.snapshotRepo(options.cwd);
        state.lateChanges = diffSnapshots(before, after);
        watchNote = `중단 뒤 ${Math.round(watchMs / 1000)}초 동안 바뀐 파일 ${state.lateChanges.length}개`;
      } catch (error) {
        watchNote = `중단 뒤 변경 확인 실패: ${error?.message ?? error}`;
      }
      outcome = {
        timedOut: true,
        status: 1,
        threadId: ids.threadId,
        turnId: ids.turnId,
        error: { message: `제한 시간 ${options.timeoutMin}분 초과 (중단 ${state.interrupt.interrupted ? "성공" : "실패"}: ${state.interrupt.detail ?? "-"}); ${watchNote}` }
      };
    }

    const threadId = outcome.threadId ?? ids.threadId ?? null;
    const turnId = outcome.turnId ?? ids.turnId ?? null;
    if (threadId) state.threadId = threadId;
    const summary = threadId && turnId ? await deps.readTurnSummary(threadId, turnId) : null;
    for (const found of findNetworkCommands(summary?.commands ?? [])) state.networkCommands.push({ ...found, turnId });
    state.turns.push({
      turnId,
      model: summary?.model ?? null,
      tokens: summary?.tokens ?? null,
      commands: summary?.commands ?? [],
      weeklyStart: weeklyPercent(summary?.rateLimitsStart),
      weeklyEnd: weeklyPercent(summary?.rateLimitsEnd)
    });

    const failed = Boolean(outcome.timedOut || outcome.thrown) || outcome.status !== 0;
    if (!failed) {
      // 재연결처럼 Codex가 재시도한 오류는 차례가 정상으로 끝났으면 실패가 아니다. 결과에만 남긴다.
      if (outcome.error) state.transientError = String(outcome.error.message ?? outcome.error);
      return { exit: null, threadId, finalMessage: outcome.finalMessage ?? "" };
    }
    const error = outcome.error ?? summary?.error ?? null;
    if (!outcome.timedOut && (summary?.limitReached || isLimitError(outcome.error) || isLimitError(summary?.error))) {
      return { exit: EXIT.LIMIT, reason: `한도 도달: ${error?.message ?? "세션 기록의 한도 정보"}` };
    }
    return { exit: EXIT.FAILED, reason: `Codex 호출 실패: ${error?.message ?? `status ${outcome.status}`}` };
  }
}

// 중단 요청은 응답이 없거나 예외를 던져도 제한 시간 결과를 잃지 않도록 시간 상한을 두고 결과를 항상 돌려준다.
async function requestInterrupt(deps, request) {
  let timer;
  const limit = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ attempted: true, interrupted: false, detail: "중단 요청 시간 초과" }), deps.interruptTimeoutMs ?? 30_000);
  });
  try {
    const pending = Promise.resolve(deps.interrupt(request));
    pending.catch(() => {});
    const result = await Promise.race([pending, limit]);
    return result ?? { attempted: true, interrupted: false, detail: "중단 결과 없음" };
  } catch (error) {
    return { attempted: true, interrupted: false, detail: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

// Codex를 부른 뒤에는 종료 코드와 상관없이 하위 에이전트, 위험 명령, 임시 폴더, 보호 경로, 새 폴더를 확인한다.
// 확인이 실패해도 결과는 잃지 않고 경고로 남긴다.
function inspectAfterCodex(options, deps, state, startedAt) {
  try {
    state.subagents = state.threadId ? deps.readSubagents(state.threadId, startedAt) : [];
  } catch (error) {
    state.warnings.push(`하위 에이전트 확인 실패: ${error?.message ?? error}`);
  }
  for (const child of state.subagents) {
    for (const found of findNetworkCommands(child.commands)) state.networkCommands.push({ ...found, turnId: null, subagent: child.threadId });
  }
  state.riskyCommands = findRiskyCommands([...state.turns.flatMap((turn) => turn.commands), ...state.subagents.flatMap((child) => child.commands)]);
  try {
    state.tempCleanup = deps.cleanupCodexTmp();
  } catch (error) {
    state.warnings.push(`임시 폴더 정리 실패: ${error?.message ?? error}`);
  }
  try {
    const changed = deps.listChangedFiles(options.cwd);
    if (state.protectedChanges.length === 0) state.protectedChanges = findProtectedChanges(changed, deps.settings.protectedPaths);
    state.newRootDirs = suspiciousNewDirs(state.rootBefore, deps.listRootDirs(options.cwd), changed, (name) => deps.isIgnored(options.cwd, name));
  } catch (error) {
    state.warnings.push(`호출 뒤 저장소 확인 실패: ${error?.message ?? error}`);
  }
}

function buildWarnings(state) {
  const warnings = [...state.warnings];
  for (const item of state.networkCommands) warnings.push(`네트워크 명령 감지 (${item.matches.join(", ")}): ${item.command}`);
  for (const item of state.riskyCommands) warnings.push(`위험 명령 감지 (${item.matches.join(", ")}): ${item.command}`);
  if (state.subagents.length > 0) warnings.push(`하위 에이전트 ${state.subagents.length}개: ${state.subagents.map((child) => child.threadId).join(", ")}`);
  if (state.tempCleanup?.removed.length > 0) warnings.push(`남은 임시 항목 ${state.tempCleanup.removed.length}개 정리: ${state.tempCleanup.removed.join(", ")}`);
  if (state.tempCleanup?.failed.length > 0) warnings.push(`임시 항목 정리 실패: ${state.tempCleanup.failed.join(", ")}`);
  if (state.newRootDirs.length > 0) warnings.push(`저장소 최상위에 git에 보이지 않는 새 폴더: ${state.newRootDirs.join(", ")}`);
  if (state.protectedChanges.length > 0) warnings.push(`보호 경로 변경(커밋 안 함): ${state.protectedChanges.join(", ")}`);
  if (state.lateChanges?.length > 0) warnings.push(`중단 뒤 바뀐 파일: ${state.lateChanges.join(", ")}`);
  return warnings;
}

function finalize(options, deps, state, startedAt, exitCode, reason) {
  if (state.codexRan) inspectAfterCodex(options, deps, state, startedAt);
  const finishedAt = deps.now();
  const mainTokens = sumTokens(state.turns.map((turn) => turn.tokens));
  const subagentTokens = sumTokens(state.subagents.map((child) => child.tokens));
  const usage = {
    tokens: mainTokens,
    subagentCount: state.subagents.length,
    subagentTokens,
    totalTokens: sumTokens([mainTokens, subagentTokens]),
    weeklyStart: state.turns.find((turn) => turn.weeklyStart !== null)?.weeklyStart ?? null,
    weeklyEnd: [...state.turns].reverse().find((turn) => turn.weeklyEnd !== null)?.weeklyEnd ?? null,
    models: [...new Set(state.turns.map((turn) => turn.model).filter(Boolean))]
  };
  const result = {
    exitCode,
    reason,
    action: options.action,
    role: options.role ?? null,
    task: options.task ?? null,
    round: options.round ?? null,
    threadId: state.threadId,
    turnIds: state.turns.map((turn) => turn.turnId),
    status: state.report?.status ?? null,
    report: state.report,
    commit: state.commit,
    corrections: state.corrections,
    formatCorrections: state.formatCorrections,
    mismatchCorrections: state.mismatchCorrections,
    transientError: state.transientError,
    networkCommands: state.networkCommands,
    riskyCommands: state.riskyCommands,
    subagents: state.subagents.map(({ threadId, tokens }) => ({ threadId, tokens })),
    tempCleanup: state.tempCleanup,
    newRootDirs: state.newRootDirs,
    protectedChanges: state.protectedChanges,
    lateChanges: state.lateChanges,
    warnings: buildWarnings(state),
    interrupt: state.interrupt ?? null,
    durationSec: Math.round((finishedAt - startedAt) / 1000),
    usage,
    finishedAt: new Date(finishedAt).toISOString()
  };
  if (options.action !== "check") {
    try {
      deps.writeJson(options.out, result);
    } catch (error) {
      result.reason += ` (결과 기록 실패: ${error?.message ?? error})`;
    }
    if (state.turns.length > 0) {
      try {
        deps.appendLine(path.join(options.workspace, USAGE_FILE), {
          time: result.finishedAt,
          action: result.action,
          role: result.role,
          task: result.task,
          round: result.round,
          threadId: result.threadId,
          exitCode,
          status: result.status,
          corrections: result.corrections,
          formatCorrections: result.formatCorrections,
          mismatchCorrections: result.mismatchCorrections,
          networkCommands: result.networkCommands.length,
          riskyCommands: result.riskyCommands.length,
          lateChanges: result.lateChanges?.length ?? null,
          durationSec: result.durationSec,
          models: usage.models,
          tokens: usage.tokens,
          subagentCount: usage.subagentCount,
          subagentTokens: usage.subagentTokens,
          totalTokens: usage.totalTokens,
          weeklyStart: usage.weeklyStart,
          weeklyEnd: usage.weeklyEnd
        });
      } catch (error) {
        result.reason += ` (결과 기록 실패: ${error?.message ?? error})`;
      }
    }
  }
  return { exitCode, result, summaryLine: formatSummary(result, options.out) };
}

export function formatSummary(result, out) {
  const weekly = `${result.usage.weeklyStart ?? "-"}%->${result.usage.weeklyEnd ?? "-"}%`;
  return [
    `codex-run exit=${result.exitCode}`,
    `status=${result.status ?? "-"}`,
    `thread=${result.threadId ?? "-"}`,
    `commit=${result.commit ?? "-"}`,
    `corrections=${result.corrections}`,
    `warnings=${result.warnings.length}`,
    `tokens=${result.usage.totalTokens?.total_tokens ?? "-"}`,
    `weekly=${weekly}`,
    `subagents=${result.usage.subagentCount}`,
    `result=${out ?? "-"}`,
    `reason=${result.reason}`
  ].join(" ");
}
```

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/run.test.mjs`
Expected: PASS (기존 27개 + 새 10개)

기존 테스트가 실패하면 테스트를 고치지 말고 위 코드가 기존 동작을 바꾼 곳을 찾아 고친다. 예외는 하나뿐이다: 기존 "check는 환경 점검만 하고 파일을 쓰지 않는다"가 이유 문구를 정확히 비교한다면, 새 문구 `환경 점검 통과 (외부 연결 도구 0개)`로 바꾼다.

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 6: 커밋한다**

```bash
git add plugin/scripts/lib/run.mjs plugin/scripts/test/run.test.mjs
git commit -m "feat(plugin): wire limits, project config, protected paths, sub-agents, risky commands and temp cleanup into the wrapper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 실제 deps와 새 동작 (`codex-run.mjs`)

**Files:**
- Modify: `plugin/scripts/codex-run.mjs` (전체 교체)

**Interfaces:**
- Consumes: Task 1~12의 모든 함수
- Produces: CLI 동작 `limits`(`--phase`, `--tasks`)와 `trust-report`. `check`, `start`, `resume`이 프로젝트 Codex 설정, 한도, 외부 연결 도구, 하위 에이전트, 임시 폴더를 다룬다.

이 파일은 실제 파일, git, Codex 앱 서버를 쓰므로 단위 테스트가 없다. Step 3의 수동 확인(토큰을 쓰지 않음)으로 확인한다.

- [ ] **Step 1: `codex-run.mjs`를 교체한다**

`plugin/scripts/codex-run.mjs` 전체를 다음으로 바꾼다:

```js
#!/usr/bin/env node
// Codex 플러그인을 부르는 유일한 진입점. 쓰는 법은 plugin/skills/codex-planning/SKILL.md에 있다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { defaultPaths, pluginPaths, EXIT } from "./lib/pins.mjs";
import { parseCliArgs } from "./lib/cli-args.mjs";
import { collectEnvironmentProblems } from "./lib/environment.mjs";
import { listChangedFiles, commitFiles, buildSnapshot } from "./lib/git-changes.mjs";
import { findRolloutFile, summarizeTurn } from "./lib/rollout.mjs";
import { runWrapper } from "./lib/run.mjs";
import { shutdownBroker, isProcessAlive } from "./lib/broker.mjs";
import { parseSettings } from "./lib/settings.mjs";
import { evaluateLimits, formatLimitLines } from "./lib/limits.mjs";
import { PROJECT_CONFIG_REL, buildProjectConfig, checkEffectiveConfig, codexTmpDir, findAppsTools, hashText } from "./lib/project-config.mjs";
import { emptyDir, listRootDirs } from "./lib/temp-cleanup.mjs";
import { findSubagents } from "./lib/subagents.mjs";
import { findWorkflowTrustEntries, formatTrustReport } from "./lib/trust.mjs";

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`codex-run: ${parsed.error}`);
  process.exit(EXIT.FAILED);
}
const { options } = parsed;
const paths = defaultPaths();
const plugin = pluginPaths();

let codexLib = null;
async function loadCodexLib() {
  codexLib ??= await import(pathToFileURL(paths.codexLib).href);
  return codexLib;
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 공식 플러그인의 클라이언트로 브로커 없이 Codex 앱 서버를 잠깐 띄워 요청한다. 토큰을 쓰지 않는 요청만 한다.
async function withDirectClient(cwd, fn) {
  const { CodexAppServerClient } = await import(pathToFileURL(paths.codexAppServerLib).href);
  const client = await CodexAppServerClient.connect(cwd, { disableBroker: true });
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

// 대화 기록을 남기지 않는 대화 시작(토큰 없음). Codex는 이때 그 폴더를 신뢰 목록에 등록한다.
const startEphemeralThread = (client, cwd) =>
  client.request("thread/start", { cwd, approvalPolicy: "never", sandbox: "workspace-write", ephemeral: true, serviceName: "llm-workflow" });

const loadedSettings = parseSettings(readText(plugin.settingsFile) ?? "");
function requireSettings(label) {
  if (!loadedSettings.ok) {
    console.error(`${label}: ${loadedSettings.error} (${plugin.settingsFile})`);
    process.exit(EXIT.ENVIRONMENT);
  }
  return loadedSettings.settings;
}

if (options.action === "shutdown") {
  let broker;
  try {
    broker = await import(pathToFileURL(paths.codexBrokerLib).href);
  } catch (error) {
    console.error(`codex-run shutdown: Codex 플러그인의 브로커 라이브러리를 불러올 수 없습니다: ${error.message}`);
    process.exit(EXIT.ENVIRONMENT);
  }
  const result = await shutdownBroker(options.cwd, {
    loadBrokerSession: broker.loadBrokerSession,
    sendBrokerShutdown: broker.sendBrokerShutdown,
    teardownBrokerSession: broker.teardownBrokerSession,
    clearBrokerSession: broker.clearBrokerSession,
    isAlive: (pid) => isProcessAlive(pid),
    sleep,
    now: () => Date.now()
  });
  console.log(`codex-run shutdown stopped=${result.stopped} exited=${result.exited ?? "-"} pid=${result.pid ?? "-"} detail=${result.detail}`);
  // 브로커가 없으면 0, 닫고 종료까지 확인했으면 0, 그 밖(끝나지 않음, 확인 불가)은 3이다.
  const noBroker = !result.stopped && result.pid === null;
  process.exit(noBroker || result.exited === true ? EXIT.OK : EXIT.FAILED);
}

if (options.action === "limits") {
  const settings = requireSettings("codex-run limits");
  let evaluation;
  try {
    const response = await withDirectClient(options.cwd, (client) => client.request("account/rateLimits/read", {}));
    evaluation = evaluateLimits(response, settings, { phase: options.phase, tasks: options.tasks });
  } catch (error) {
    evaluation = { status: "error", planType: null, reason: `한도를 읽지 못했습니다: ${error.message}`, windows: [] };
  }
  for (const line of formatLimitLines(evaluation)) console.log(line);
  process.exit(evaluation.status === "ok" ? EXIT.OK : evaluation.status === "short" ? EXIT.LIMIT : EXIT.ENVIRONMENT);
}

if (options.action === "trust-report") {
  let lines;
  try {
    const read = await withDirectClient(options.cwd, (client) => client.request("config/read", { includeLayers: false, cwd: options.cwd }));
    lines = formatTrustReport(findWorkflowTrustEntries(read?.config?.projects ?? {}, os.tmpdir(), (dir) => fs.existsSync(dir)));
  } catch (error) {
    console.error(`codex-run trust-report: 신뢰 목록을 읽지 못했습니다: ${error.message}`);
    process.exit(EXIT.ENVIRONMENT);
  }
  for (const line of lines) console.log(line);
  process.exit(EXIT.OK);
}

const settings = requireSettings("codex-run");
const configFile = path.join(options.cwd, PROJECT_CONFIG_REL);
const expectedConfig = { repoDir: options.cwd, shimDir: plugin.shimDir };

function isIgnored(cwd, rel) {
  try {
    execFileSync("git", ["-C", cwd, "check-ignore", "-q", "--", rel], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// .codex/가 git 무시 대상이 아니면 저장소별 무시 목록(.git/info/exclude)에 더한다. 추적 파일은 바꾸지 않는다.
function ensureCodexIgnored() {
  if (isIgnored(options.cwd, ".codex/config.toml")) return null;
  const rel = execFileSync("git", ["-C", options.cwd, "rev-parse", "--git-path", "info/exclude"], { encoding: "utf8" }).trim();
  const exclude = path.resolve(options.cwd, rel);
  const current = readText(exclude) ?? "";
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  fs.writeFileSync(exclude, `${current}${current && !current.endsWith("\n") ? "\n" : ""}.codex/\n`);
  return "`.codex/`가 git 무시 목록에 없어 .git/info/exclude에 더했습니다";
}

async function prepareProjectConfig() {
  const warnings = [];
  const problems = [];
  const ignoreNote = ensureCodexIgnored();
  if (ignoreNote) warnings.push(ignoreNote);
  const sddIgnore = path.join(options.cwd, ".superpowers", "sdd", ".gitignore");
  fs.mkdirSync(path.dirname(sddIgnore), { recursive: true });
  if (!fs.existsSync(sddIgnore)) fs.writeFileSync(sddIgnore, "*\n");
  fs.mkdirSync(codexTmpDir(options.cwd), { recursive: true });
  const text = buildProjectConfig(expectedConfig);
  const before = readText(configFile);
  if (before !== null && before !== text) warnings.push("프로젝트 Codex 설정을 다시 썼습니다(이전 내용과 달랐음)");
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, text);
  try {
    const checked = await withDirectClient(options.cwd, async (client) => {
      const read = async () => checkEffectiveConfig(await client.request("config/read", { includeLayers: true, cwd: options.cwd }), expectedConfig);
      let result = await read();
      if (result.projectDisabled) {
        // 그 폴더에서 Codex를 처음 쓰면 신뢰 등록 전이라 프로젝트 설정이 꺼져 있다. 토큰을 쓰지 않는 대화 시작으로 등록한다.
        await startEphemeralThread(client, options.cwd);
        result = await read();
      }
      return result;
    });
    problems.push(...checked.problems);
  } catch (error) {
    problems.push(`프로젝트 Codex 설정을 확인하지 못했습니다: ${error.message}`);
  }
  return { hash: hashText(text), warnings, problems };
}

async function checkAppsTools() {
  try {
    const status = await withDirectClient(options.cwd, async (client) => {
      const started = await startEphemeralThread(client, options.cwd);
      return client.request("mcpServerStatus/list", { threadId: started.thread.id, detail: "toolsAndAuthOnly" });
    });
    const apps = findAppsTools(status);
    if (apps.present) return { problems: [`외부 연결 도구가 켜져 있습니다: codex_apps 도구 ${apps.tools.length}개`], toolCount: apps.tools.length };
    return { problems: [], toolCount: 0 };
  } catch (error) {
    return { problems: [`외부 연결 도구를 확인하지 못했습니다: ${error.message}`], toolCount: null };
  }
}

async function checkLimits() {
  try {
    const response = await withDirectClient(options.cwd, (client) => client.request("account/rateLimits/read", {}));
    return evaluateLimits(response, settings, { phase: "call" });
  } catch (error) {
    return { status: "error", reason: `한도를 읽지 못했습니다: ${error.message}` };
  }
}

const deps = {
  now: () => Date.now(),
  readText,
  settings,
  checkEnvironment: (repoDir) =>
    collectEnvironmentProblems({
      repoDir,
      paths,
      readText,
      fileExists: (file) => fs.existsSync(file),
      // 원격 마켓플레이스 목록 때문에 출력이 1MiB를 넘을 수 있다(2026-10-10 약 1.06MB).
      codexPluginList: () => execSync("codex plugin list", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 })
    }),
  prepareProjectConfig,
  projectConfigHash: () => hashText(readText(configFile) ?? ""),
  checkAppsTools,
  checkLimits,
  ensureWorkspace: (dir) => {
    fs.mkdirSync(dir, { recursive: true });
    const ignoreFile = path.join(options.cwd, ".superpowers", "sdd", ".gitignore");
    if (!fs.existsSync(ignoreFile)) fs.writeFileSync(ignoreFile, "*\n");
  },
  listChangedFiles,
  commitFiles,
  listRootDirs: (cwd) => listRootDirs(cwd),
  isIgnored: (cwd, rel) => isIgnored(cwd, rel),
  cleanupCodexTmp: () => emptyDir(codexTmpDir(options.cwd)),
  readSubagents: (threadId, sinceMs) => findSubagents(paths.codexSessions, threadId, sinceMs),
  snapshotRepo: (cwd) =>
    buildSnapshot(listChangedFiles(cwd), (file) => {
      try {
        const stat = fs.statSync(path.join(cwd, file));
        return { mtimeMs: stat.mtimeMs, size: stat.size };
      } catch {
        return null;
      }
    }),
  sleep,
  runTurn: async ({ cwd, prompt, resumeThreadId, effort, model, onProgress }) => {
    const { runAppServerTurn } = await loadCodexLib();
    const result = await runAppServerTurn(cwd, {
      prompt,
      resumeThreadId,
      effort,
      model,
      onProgress,
      sandbox: "workspace-write",
      persistThread: true,
      threadName: `llm-workflow ${options.role ?? ""} ${options.task ?? ""}`.trim()
    });
    return {
      status: result.status,
      threadId: result.threadId,
      turnId: result.turnId,
      finalMessage: result.finalMessage,
      error: result.error ?? null
    };
  },
  interrupt: async ({ cwd, threadId, turnId }) => {
    const { interruptAppServerTurn } = await loadCodexLib();
    return interruptAppServerTurn(cwd, { threadId, turnId });
  },
  readTurnSummary: async (threadId, turnId) => {
    let summary = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const file = findRolloutFile(paths.codexSessions, threadId);
      if (file) {
        summary = summarizeTurn(fs.readFileSync(file, "utf8"), turnId);
        if (summary.completed) return summary;
      }
      await sleep(300);
    }
    return summary;
  },
  appendLine: (file, value) => fs.appendFileSync(file, `${JSON.stringify(value)}\n`),
  writeJson: (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  }
};

const { exitCode, summaryLine } = await runWrapper(options, deps);
console.log(summaryLine);
process.exit(exitCode);
```

- [ ] **Step 2: 전체 테스트를 돌린다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 3: 토큰을 쓰지 않는 수동 확인을 한다**

OS 임시 폴더에 조사용 저장소를 만든다(`.gitignore` 없음, Review Focus 1 확인용):

```bash
R=$(mktemp -d "$TEMP/llm-workflow-devcheck-XXXXXX")/repo && mkdir -p "$R" && git -C "$R" init -q -b main && printf 'dev check\n' > "$R/README.md" && git -C "$R" add README.md && git -C "$R" commit -q -m init && echo "$R"
```

다음을 차례로 돌리고 결과를 확인한다(각 명령에 `timeout 180`을 붙인다):

1. `timeout 180 node plugin/scripts/codex-run.mjs check --cwd "$R"`
   - Expected: `exit=0`, `reason=환경 점검 통과 (외부 연결 도구 0개)`, `warnings=1`(`.git/info/exclude`에 더함)
2. `cat "$R/.codex/config.toml"`
   - Expected: `apps = false`, `set = { TEMP = '...\.superpowers\sdd\codex-tmp', ..., PYTHONPATH = '<개발 worktree>\plugin\scripts\sandbox-python' }`
3. `cat "$R/.git/info/exclude" | tail -1` → `.codex/`, `git -C "$R" status --short` → 비어 있음
4. `timeout 180 node plugin/scripts/codex-run.mjs check --cwd "$R"` (두 번째)
   - Expected: `exit=0`, `warnings=0`
5. `timeout 180 node plugin/scripts/codex-run.mjs limits --cwd "$R" --phase call`
   - Expected: 종료 코드 0, `codex-run limits status=ok plan=prolite`, `window=10080m ...` 줄
6. `timeout 180 node plugin/scripts/codex-run.mjs trust-report --cwd "$R"`
   - Expected: 종료 코드 0, `codex-run trust-report entries=<N>`, 방금 만든 `llm-workflow-devcheck-*` 항목이 들어 있음

하나라도 기대와 다르면 원인을 찾아 고치고 1번부터 다시 돌린다. 결과(명령과 출력 요약)를 보고 파일에 적는다.

- [ ] **Step 4: 커밋한다**

```bash
git add plugin/scripts/codex-run.mjs
git commit -m "feat(plugin): implement the wrapper deps for project config, limits, apps check, sub-agents and temp cleanup, and add limits and trust-report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 14: 마스터의 기계적인 일을 맡는 `codex-task.mjs`

**Files:**
- Create: `plugin/scripts/lib/task-prompt.mjs`
- Create: `plugin/scripts/codex-task.mjs`
- Test: `plugin/scripts/test/task-prompt.test.mjs`, `plugin/scripts/test/codex-task.test.mjs`

**Interfaces:**
- Consumes: `defaultPaths().superpowersRoot`, `PLUGIN_ROOT`, `EXIT` (pins.mjs), `codex-run.mjs`(래퍼), Superpowers 스크립트 `sdd-workspace`, `task-brief`, `review-package`, 검수 틀 3개, 우리 지시문 틀(`plugin/skills/codex-execution/*-prompt.md`, `review-additions.md`)
- Produces: CLI 세 가지
  - `node codex-task.mjs run --cwd <저장소> --plan <계획> --role implement|fix|handoff|final-fix [--task N] [--round R] [--thread ID] [--effort E] [--context 파일] [--findings 파일] [--diff 파일] [--timeout-min M] [--dry-run]`
  - `node codex-task.mjs review --cwd <저장소> --plan <계획> --kind task|rereview|final --base <SHA> [--task N|final] [--model M] [--findings 파일] [--concerns 문장]`
  - `node codex-task.mjs ledger --cwd <저장소> --plan <계획> --text <줄> [--file progress|planning]`
- 종료 코드: `run`은 래퍼의 종료 코드를 그대로 돌려준다. 인자 오류와 Superpowers 스크립트 실패는 3이다.

**역할별 필수 인자와 틀:**

| 역할 | 틀 | 필수 | 래퍼 동작 |
|---|---|---|---|
| implement | `implement-prompt.md` | `--task` | `--thread`가 없으면 start, 있으면 resume (`--role implement`) |
| fix | `fix-prompt.md` | `--task --round --findings --thread` | resume (`--role fix`) |
| handoff | `handoff-prompt.md` | `--task --round --diff` | `--thread`가 없으면 start (`--role fix`) |
| final-fix | `final-fix-prompt.md` | `--findings --diff` | start (`--role final-fix`) |

**`run`이 진행 기록(`progress.md`)에 쓰는 줄:**
- 호출 전(새 대화의 implement만): `Task N: base <base7>`
- 호출 뒤: `Task N: codex thread <ID> (<역할> round R) — exit <코드> <상태>, commit <해시|->, tokens <합계>, subagents <수>`. implement에는 괄호가 없다. 최종 수정은 `Final fix: codex thread <ID> — ...`다.
- 결과의 경고에 따라:
  - 네트워크 명령: `네트워크 경고: <명령>`
  - 위험 명령: `위험 명령 경고: <종류>: <명령>`
  - 하위 에이전트: `하위 에이전트 경고: <대화 ID> <수>개`
  - 그 밖의 경고: `래퍼 경고: <문장>`

Git Bash의 Superpowers 스크립트는 `/d/Work/...` 같은 POSIX 경로를 출력한다. Node에서 쓰려면 `fromBashPath`로 바꾼다.

- [ ] **Step 1: 순수 함수의 실패하는 테스트를 쓴다**

`plugin/scripts/test/task-prompt.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  fillCurly,
  fillSquare,
  leftoverCurly,
  planTaskName,
  planSpecPath,
  planSection,
  extractTemplatePrompt,
  wrotePath,
  fromBashPath,
  toRepoRelative,
  RUN_ROLES,
  templateFor,
  runFiles,
  wrapperCall
} from "../lib/task-prompt.mjs";
import { defaultPaths } from "../lib/pins.mjs";

const PLAN = [
  "# Demo Implementation Plan",
  "",
  "**Spec:** `docs/specs/demo.md`",
  "",
  "## Global Constraints",
  "",
  "- Node only.",
  "- Korean messages.",
  "",
  "## Review Focus",
  "",
  "1. x",
  "",
  "### Task 2: Add farewell",
  "",
  "- [ ] Step 1"
].join("\n");

test("자리표시자를 채우고 남은 것을 찾는다", () => {
  assert.equal(fillCurly("A {{X}} {{Y}}", { X: 1 }), "A 1 {{Y}}");
  assert.deepEqual(leftoverCurly("A {{Y}} {{Y}} {{Z}}"), ["Y", "Z"]);
  assert.equal(fillSquare("B [BASE_SHA]..[HEAD_SHA] [KEEP]", { BASE_SHA: "a", HEAD_SHA: "b" }), "B a..b [KEEP]");
  assert.equal(fillSquare("[FINDINGS]", { FINDINGS: "see [BASE_SHA]" }), "see [BASE_SHA]");
});

test("계획에서 작업 이름, 명세 경로, 절 내용을 뽑는다", () => {
  assert.equal(planTaskName(PLAN, 2), "Add farewell");
  assert.equal(planTaskName(PLAN, 3), null);
  assert.equal(planSpecPath(PLAN), "docs/specs/demo.md");
  assert.equal(planSection(PLAN, "Global Constraints"), "- Node only.\n- Korean messages.");
  assert.equal(planSection(PLAN, "Missing"), null);
});

test("Superpowers 검수 틀에서 실제 지시문만 꺼낸다", () => {
  const sp = path.join(defaultPaths().superpowersRoot, "skills");
  for (const file of ["subagent-driven-development/task-reviewer-prompt.md", "subagent-driven-development/re-review-prompt.md", "requesting-code-review/code-reviewer.md"]) {
    const prompt = extractTemplatePrompt(fs.readFileSync(path.join(sp, file), "utf8"));
    assert.ok(prompt && prompt.length > 200, file);
    assert.doesNotMatch(prompt, /^Subagent \(general-purpose\)/, file);
    assert.doesNotMatch(prompt, /^\s*prompt: \|/m, file);
    assert.match(prompt, /\[HEAD_SHA\]/, file);
  }
  assert.equal(extractTemplatePrompt("no fence"), null);
});

test("스크립트 출력과 경로를 바꾼다", () => {
  assert.equal(wrotePath("wrote /d/w/.superpowers/sdd/p/task-1-brief.md: 40 lines\n"), "/d/w/.superpowers/sdd/p/task-1-brief.md");
  assert.equal(wrotePath("nothing"), null);
  assert.equal(fromBashPath("/d/Work/repo/x.md"), "D:\\Work\\repo\\x.md");
  assert.equal(fromBashPath("C:\\already\\windows"), "C:\\already\\windows");
  assert.equal(toRepoRelative("C:\\r", "C:\\r\\.superpowers\\sdd\\p\\a.md"), ".superpowers/sdd/p/a.md");
});

test("역할별 틀, 파일 이름, 래퍼 호출 방식", () => {
  assert.deepEqual(RUN_ROLES, ["implement", "fix", "handoff", "final-fix"]);
  assert.equal(templateFor("handoff"), "handoff-prompt.md");
  assert.deepEqual(runFiles({ role: "implement", task: "3" }), { prompt: "task-3-codex-prompt.md", report: "task-3-report.md" });
  assert.deepEqual(runFiles({ role: "fix", task: "3", round: 2 }), { prompt: "task-3-fix-r2-codex-prompt.md", report: "task-3-report.md" });
  assert.deepEqual(runFiles({ role: "final-fix" }), { prompt: "final-fix-codex-prompt.md", report: "final-fix-report.md" });
  assert.deepEqual(wrapperCall({ role: "implement" }), { action: "start", role: "implement", round: null });
  assert.deepEqual(wrapperCall({ role: "implement", thread: "t" }), { action: "resume", role: "implement", round: null });
  assert.deepEqual(wrapperCall({ role: "fix", thread: "t", round: 2 }), { action: "resume", role: "fix", round: 2 });
  assert.deepEqual(wrapperCall({ role: "handoff", round: 4 }), { action: "start", role: "fix", round: 4 });
  assert.deepEqual(wrapperCall({ role: "final-fix" }), { action: "start", role: "final-fix", round: null });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/task-prompt.test.mjs`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: `task-prompt.mjs`를 만든다**

`plugin/scripts/lib/task-prompt.mjs`:

```js
// codex-task.mjs의 순수 함수: 계획에서 값 뽑기, 틀 채우기, Superpowers 스크립트 출력 읽기, 파일 이름 정하기.
import path from "node:path";

export const fillCurly = (text, values) => text.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => (key in values ? String(values[key]) : match));
export const fillSquare = (text, values) => text.replace(/\[([A-Z_]+)\]/g, (match, key) => (key in values ? String(values[key]) : match));
export const leftoverCurly = (text) => [...new Set([...text.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((match) => match[1]))];

export function planTaskName(plan, n) {
  const match = new RegExp(`^#{2,4} Task ${n}: (.+)$`, "m").exec(plan);
  return match ? match[1].trim() : null;
}

export function planSpecPath(plan) {
  const match = /^\*\*Spec:\*\*\s*`?([^`\n]+?)`?\s*$/m.exec(plan);
  return match ? match[1].trim() : null;
}

// "## 제목" 아래부터 다음 "## " 제목 전까지(### 은 포함)를 돌려준다.
export function planSection(plan, title) {
  const lines = plan.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

// Superpowers 검수 틀은 첫 코드 블록의 "prompt: |" 아래 들여쓴 본문이 실제 지시문이다.
export function extractTemplatePrompt(markdown) {
  const block = /```[^\n]*\r?\n([\s\S]*?)\r?\n```/.exec(markdown)?.[1];
  if (!block) return null;
  const lines = block.split(/\r?\n/);
  const at = lines.findIndex((line) => /^\s*prompt:\s*\|\s*$/.test(line));
  if (at < 0) return block;
  const body = lines.slice(at + 1);
  const indent = Math.min(...body.filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length));
  return body.map((line) => line.slice(indent)).join("\n").trim();
}

export function wrotePath(output) {
  const match = /^wrote (.+?): /m.exec(output ?? "");
  return match ? match[1].trim() : null;
}

// Git Bash가 출력한 /d/Work/... 를 D:\Work\... 로 바꾼다. 이미 Windows 경로면 그대로 둔다.
export function fromBashPath(value) {
  const match = /^\/([a-zA-Z])\/(.*)$/.exec(value ?? "");
  return match ? `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, "\\")}` : value;
}

export const toRepoRelative = (repoDir, file) => path.win32.relative(repoDir, path.win32.resolve(repoDir, file)).split("\\").join("/");

const ROLE_TEMPLATES = { implement: "implement-prompt.md", fix: "fix-prompt.md", handoff: "handoff-prompt.md", "final-fix": "final-fix-prompt.md" };
export const RUN_ROLES = Object.freeze(Object.keys(ROLE_TEMPLATES));
export const templateFor = (role) => ROLE_TEMPLATES[role];

export function runFiles({ role, task, round }) {
  if (role === "final-fix") return { prompt: "final-fix-codex-prompt.md", report: "final-fix-report.md" };
  const suffix = role === "implement" ? "" : `-${role}-r${round ?? 0}`;
  return { prompt: `task-${task}${suffix}-codex-prompt.md`, report: `task-${task}-report.md` };
}

export function wrapperCall({ role, thread, round }) {
  return {
    action: thread ? "resume" : "start",
    role: role === "handoff" ? "fix" : role,
    round: role === "implement" || role === "final-fix" ? null : round ?? 0
  };
}
```

- [ ] **Step 4: 순수 함수 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/task-prompt.test.mjs`
Expected: PASS

- [ ] **Step 5: CLI의 실패하는 테스트를 쓴다**

`plugin/scripts/test/codex-task.test.mjs` (Codex를 부르지 않는다. `run`은 `--dry-run`만 시험한다):

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { PLUGIN_ROOT } from "../lib/pins.mjs";

const script = path.join(PLUGIN_ROOT, "scripts", "codex-task.mjs");
const bash = spawnSync("bash", ["--version"], { encoding: "utf8" });
const skip = bash.status === 0 ? false : "Git Bash가 있어야 한다";

const PLAN = [
  "# Demo Implementation Plan",
  "",
  "**Spec:** `docs/spec.md`",
  "",
  "## Global Constraints",
  "",
  "- Node only.",
  "",
  "### Task 1: Add greeting",
  "",
  "**Files:**",
  "- Create: `greet.txt`",
  "",
  "- [ ] **Step 1: write greet.txt**"
].join("\n");

function makeRepo() {
  const repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "codex-task-test-")), "repo");
  fs.mkdirSync(path.join(repo, "docs"), { recursive: true });
  fs.writeFileSync(path.join(repo, "docs", "plan.md"), `${PLAN}\n`);
  fs.writeFileSync(path.join(repo, "docs", "spec.md"), "# spec\n");
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "test");
  git("config", "user.email", "test@example.invalid");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  return { repo, git };
}

const runTask = (repo, args) => spawnSync(process.execPath, [script, ...args, "--cwd", repo, "--plan", "docs/plan.md"], { cwd: repo, encoding: "utf8", timeout: 120_000 });

test("인자가 틀리면 3", { skip }, () => {
  const { repo } = makeRepo();
  assert.equal(runTask(repo, ["bogus"]).status, 3);
  assert.match(runTask(repo, ["run", "--role", "fix", "--task", "1", "--round", "1"]).stderr, /--findings/);
});

test("run --dry-run은 작업 지시 파일과 Codex 지시문을 만들고 래퍼 명령을 보여 준다", { skip }, () => {
  const { repo } = makeRepo();
  const run = runTask(repo, ["run", "--role", "implement", "--task", "1", "--dry-run"]);
  assert.equal(run.status, 0, run.stderr);
  const promptRel = /prompt=(\S+)/.exec(run.stdout)?.[1];
  assert.match(promptRel, /^\.superpowers\/sdd\/[^/]+\/task-1-codex-prompt\.md$/);
  const prompt = fs.readFileSync(path.join(repo, promptRel), "utf8");
  assert.match(prompt, /Task 1: Add greeting/);
  assert.match(prompt, /- Node only\./);
  assert.match(prompt, /task-1-brief\.md/);
  assert.match(prompt, /docs\/spec\.md/);
  assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
  assert.match(run.stdout, /wrapper: node .*codex-run\.mjs start --cwd .* --role implement .*--task 1/);
});

test("ledger는 진행 기록 머리줄을 만들고 줄을 덧붙인다", { skip }, () => {
  const { repo } = makeRepo();
  assert.equal(runTask(repo, ["ledger", "--text", "Task 1: complete (commits a..b, review clean)"]).status, 0);
  const ledger = fs.readdirSync(path.join(repo, ".superpowers", "sdd"), { recursive: true }).find((name) => String(name).endsWith("progress.md"));
  const text = fs.readFileSync(path.join(repo, ".superpowers", "sdd", String(ledger)), "utf8");
  assert.match(text, /^# SDD ledger — plan: docs\/plan\.md\n- Task 1: complete \(commits a\.\.b, review clean\)\n$/);
});

test("review --kind task는 검수 자료와 채운 검수 지시 파일을 만든다", { skip }, () => {
  const { repo, git } = makeRepo();
  const base = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(repo, "greet.txt"), "hi\n");
  git("add", "-A");
  git("commit", "-q", "-m", "feat: greet");
  const review = runTask(repo, ["review", "--kind", "task", "--task", "1", "--base", base, "--concerns", "none"]);
  assert.equal(review.status, 0, review.stderr);
  const promptRel = /prompt=(\S+)/.exec(review.stdout)?.[1];
  const packageRel = /package=(\S+)/.exec(review.stdout)?.[1];
  assert.match(review.stdout, /model=sonnet/);
  assert.ok(fs.existsSync(path.join(repo, packageRel)));
  const prompt = fs.readFileSync(path.join(repo, promptRel), "utf8");
  assert.ok(prompt.includes(base));
  assert.match(prompt, /- Node only\./);
  assert.match(prompt, /Implementer concerns/);
  for (const key of ["BRIEF_FILE", "REPORT_FILE", "BASE_SHA", "HEAD_SHA", "DIFF_FILE", "GLOBAL_CONSTRAINTS"]) assert.ok(!prompt.includes(`[${key}]`), key);
});
```

- [ ] **Step 6: 실패를 확인한다**

Run: `node --test plugin/scripts/test/codex-task.test.mjs`
Expected: FAIL (codex-task.mjs 없음)

- [ ] **Step 7: `codex-task.mjs`를 만든다**

`plugin/scripts/codex-task.mjs`:

```js
#!/usr/bin/env node
// 마스터의 기계적인 일을 대신한다: 작업 지시 파일 만들기, Codex 지시문 채우기, 래퍼 호출과 결과 요약,
// 검수 지시 파일 만들기, 진행 기록 줄 쓰기. 쓰는 법은 plugin/skills/codex-execution/SKILL.md에 있다.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { defaultPaths, PLUGIN_ROOT, EXIT } from "./lib/pins.mjs";
import {
  RUN_ROLES,
  fillCurly,
  fillSquare,
  leftoverCurly,
  planTaskName,
  planSpecPath,
  planSection,
  extractTemplatePrompt,
  wrotePath,
  fromBashPath,
  toRepoRelative,
  templateFor,
  runFiles,
  wrapperCall
} from "./lib/task-prompt.mjs";

const [command, ...rest] = process.argv.slice(2);

function fail(message) {
  console.error(`codex-task ${command ?? ""}: ${message}`);
  process.exit(EXIT.FAILED);
}

if (!["run", "review", "ledger"].includes(command)) fail("첫 인자는 run, review, ledger 중 하나여야 합니다");

let args;
try {
  ({ values: args } = parseArgs({
    args: rest,
    strict: true,
    options: {
      cwd: { type: "string" },
      plan: { type: "string" },
      role: { type: "string" },
      task: { type: "string" },
      round: { type: "string" },
      thread: { type: "string" },
      effort: { type: "string" },
      context: { type: "string" },
      findings: { type: "string" },
      diff: { type: "string" },
      "timeout-min": { type: "string" },
      "dry-run": { type: "boolean" },
      kind: { type: "string" },
      base: { type: "string" },
      model: { type: "string" },
      concerns: { type: "string" },
      text: { type: "string" },
      file: { type: "string" }
    }
  }));
} catch (error) {
  fail(error.message);
}
if (!args.cwd || !args.plan) fail("--cwd와 --plan이 필요합니다");

const repo = path.resolve(args.cwd);
const planFile = path.resolve(repo, args.plan);
if (!fs.existsSync(planFile)) fail(`계획 파일이 없습니다: ${planFile}`);
const planText = fs.readFileSync(planFile, "utf8");
const rel = (file) => toRepoRelative(repo, file);
const planRel = rel(planFile);
const sp = path.join(defaultPaths().superpowersRoot, "skills");
const execution = path.join(PLUGIN_ROOT, "skills", "codex-execution");
const git = (...gitArgs) => execFileSync("git", ["-C", repo, ...gitArgs], { encoding: "utf8" }).trim();

function bash(name, scriptArgs) {
  const proc = spawnSync("bash", [path.join(sp, "subagent-driven-development", "scripts", name), ...scriptArgs], {
    cwd: repo,
    encoding: "utf8",
    timeout: 120_000
  });
  if (proc.status !== 0) fail(`${name} 실패: ${(proc.stderr || proc.stdout || proc.error?.message || "").trim()}`);
  return proc.stdout;
}

if (args.findings && !fs.existsSync(path.resolve(repo, args.findings))) fail(`지적 파일이 없습니다: ${args.findings}`);
if (args.diff && !fs.existsSync(path.resolve(repo, args.diff))) fail(`검수 자료 파일이 없습니다: ${args.diff}`);

const workspace = fromBashPath(bash("sdd-workspace", [planRel]).trim().split(/\r?\n/).pop());

function appendLedger(which, text) {
  const file = path.join(workspace, `${which}.md`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, which === "progress" ? `# SDD ledger — plan: ${planRel}\n` : `# 계획 단계 기록 — plan: ${planRel}\n`);
  fs.appendFileSync(file, `- ${String(text).replace(/\r?\n/g, " ")}\n`);
}

if (command === "ledger") {
  if (!args.text) fail("--text가 필요합니다");
  const which = args.file ?? "progress";
  if (!["progress", "planning"].includes(which)) fail("--file은 progress 또는 planning이어야 합니다");
  appendLedger(which, args.text);
  console.log(`codex-task ledger ${which}.md: ${args.text}`);
  process.exit(EXIT.OK);
}

if (command === "review") {
  const kind = args.kind;
  if (!["task", "rereview", "final"].includes(kind)) fail("--kind는 task, rereview, final 중 하나여야 합니다");
  if (!args.base) fail("--base가 필요합니다");
  if (kind !== "final" && !args.task) fail("--task가 필요합니다 (최종 수정 재검수는 --task final)");
  if (kind === "rereview" && !args.findings) fail("rereview에는 --findings가 필요합니다");
  const head = git("rev-parse", "HEAD");
  const pkg = fromBashPath(wrotePath(bash("review-package", [planRel, args.base, head])));
  if (!pkg) fail("review-package 출력에서 검수 자료 경로를 찾지 못했습니다");
  const model = args.model ?? (kind === "final" ? "opus" : "sonnet");
  const constraints = planSection(planText, "Global Constraints") ?? "none";
  const template = (file) => extractTemplatePrompt(fs.readFileSync(path.join(sp, file), "utf8"));
  const inWorkspace = (name) => rel(path.join(workspace, name));
  let prompt;
  let name;
  if (kind === "task") {
    const additions = fs.readFileSync(path.join(execution, "review-additions.md"), "utf8");
    prompt = `${fillSquare(template("subagent-driven-development/task-reviewer-prompt.md"), {
      MODEL: model,
      BRIEF_FILE: inWorkspace(`task-${args.task}-brief.md`),
      GLOBAL_CONSTRAINTS: constraints,
      REPORT_FILE: inWorkspace(`task-${args.task}-report.md`),
      BASE_SHA: args.base,
      HEAD_SHA: head,
      DIFF_FILE: rel(pkg)
    })}\n\n${fillCurly(additions, { CONCERNS: args.concerns ?? "none" })}`;
    name = `task-${args.task}-review-prompt.md`;
  } else if (kind === "rereview") {
    const final = args.task === "final";
    prompt = fillSquare(template("subagent-driven-development/re-review-prompt.md"), {
      MODEL: model,
      BRIEF_FILE: inWorkspace(final ? "final-fix-findings.md" : `task-${args.task}-brief.md`),
      REPORT_FILE: inWorkspace(final ? "final-fix-report.md" : `task-${args.task}-report.md`),
      DIFF_FILE: rel(pkg),
      FINDINGS: fs.readFileSync(path.resolve(repo, args.findings), "utf8").trim(),
      FIX_BASE_SHA: args.base,
      HEAD_SHA: head
    });
    name = final ? "final-rereview-prompt.md" : `task-${args.task}-rereview-prompt.md`;
  } else {
    prompt = fillSquare(template("requesting-code-review/code-reviewer.md"), {
      DESCRIPTION: `Final whole-branch review of the implementation of ${planRel}`,
      PLAN_OR_REQUIREMENTS: [
        `Plan: ${planRel}`,
        `Spec: ${planSpecPath(planText) ?? "none"}`,
        `Deferred and parked findings to weigh before merge: the lines containing "minor (deferred)" or "parked" in ${inWorkspace("progress.md")}`
      ].join("\n"),
      BASE_SHA: args.base,
      HEAD_SHA: head,
      SHA: head
    });
    name = "final-review-prompt.md";
  }
  const file = path.join(workspace, name);
  fs.writeFileSync(file, `${prompt}\n`);
  console.log(`codex-task review prompt=${rel(file)} package=${rel(pkg)} model=${model}`);
  console.log(`next: ${model} 검수 서브에이전트에 "Read ${rel(file)} and follow it exactly. You are read-only." 를 보낸다`);
  process.exit(EXIT.OK);
}

// command === "run"
const role = args.role;
if (!RUN_ROLES.includes(role)) fail(`--role은 ${RUN_ROLES.join(", ")} 중 하나여야 합니다`);
const task = role === "final-fix" ? null : args.task;
if (role !== "final-fix" && !/^\d+$/.test(task ?? "")) fail("--task가 필요합니다");
const round = args.round === undefined ? null : Number(args.round);
const required = { implement: [], fix: ["round", "findings", "thread"], handoff: ["round", "diff"], "final-fix": ["findings", "diff"] }[role];
for (const key of required) if (args[key] === undefined) fail(`${role}에는 --${key}가 필요합니다`);

const brief = role === "implement" ? fromBashPath(wrotePath(bash("task-brief", [planRel, task]))) : path.join(workspace, `task-${task}-brief.md`);
const files = runFiles({ role, task, round });
const values = {
  TASK_NUMBER: task ?? "",
  TASK_NAME: (task && planTaskName(planText, task)) ?? "",
  BRIEF_PATH: brief ? rel(brief) : "",
  SPEC_PATH: planSpecPath(planText) ?? "none",
  PLAN_PATH: planRel,
  CONTEXT: args.context ? fs.readFileSync(path.resolve(repo, args.context), "utf8").trim() : "none",
  GLOBAL_CONSTRAINTS: planSection(planText, "Global Constraints") ?? "none",
  REPORT_PATH: rel(path.join(workspace, files.report)),
  FINDINGS_PATH: args.findings ? rel(path.resolve(repo, args.findings)) : "",
  ROUNDS_SO_FAR: String(Math.max(0, (round ?? 1) - 1)),
  FINDINGS_HISTORY_PATH: rel(path.join(workspace, `task-${task}-findings-history.md`)),
  DIFF_PATH: args.diff ? rel(path.resolve(repo, args.diff)) : ""
};
const prompt = fillCurly(fs.readFileSync(path.join(execution, templateFor(role)), "utf8"), values);
const left = leftoverCurly(prompt);
if (left.length > 0) fail(`지시문에 채우지 못한 자리표시자가 있습니다: ${left.join(", ")}`);
const promptFile = path.join(workspace, files.prompt);
fs.writeFileSync(promptFile, prompt);

const head = git("rev-parse", "HEAD");
const call = wrapperCall({ role, thread: args.thread, round });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.join(workspace, "codex-results", `${stamp}-${call.role}${task ? `-t${task}` : ""}.json`);
const wrapperArgs = [path.join(PLUGIN_ROOT, "scripts", "codex-run.mjs"), call.action, "--cwd", repo, "--prompt-file", promptFile, "--workspace", workspace, "--role", call.role, "--out", out];
if (task) wrapperArgs.push("--task", task);
if (call.round !== null) wrapperArgs.push("--round", String(call.round));
if (args.thread) wrapperArgs.push("--thread", args.thread);
if (args.effort) wrapperArgs.push("--effort", args.effort);
if (args["timeout-min"]) wrapperArgs.push("--timeout-min", args["timeout-min"]);

if (args["dry-run"]) {
  console.log(`codex-task run dry-run prompt=${rel(promptFile)} head=${head.slice(0, 7)}`);
  console.log(`wrapper: node ${wrapperArgs.map((value) => (/\s/.test(value) ? `"${value}"` : value)).join(" ")}`);
  process.exit(EXIT.OK);
}

if (role === "implement" && !args.thread) appendLedger("progress", `Task ${task}: base ${head.slice(0, 7)}`);
// 래퍼는 자기 제한 시간(기본 30분)과 중단 뒤 2분 감시를 가진다. 그보다 조금 길게 기다린다.
const proc = spawnSync(process.execPath, wrapperArgs, { cwd: repo, encoding: "utf8", timeout: (Number(args["timeout-min"] ?? 30) + 5) * 60_000 });
const exitCode = proc.status ?? EXIT.FAILED;
const result = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null;

const label = role === "final-fix" ? "Final fix" : `Task ${task}`;
const roleNote = role === "implement" ? "" : role === "final-fix" ? "" : ` (${role} round ${call.round})`;
appendLedger(
  "progress",
  `${label}: codex thread ${result?.threadId ?? "-"}${roleNote} — exit ${exitCode} ${result?.status ?? "-"}, commit ${result?.commit ?? "-"}, tokens ${result?.usage?.totalTokens?.total_tokens ?? "-"}, subagents ${result?.usage?.subagentCount ?? "-"}`
);
for (const item of result?.networkCommands ?? []) appendLedger("progress", `네트워크 경고: ${item.command}`);
for (const item of result?.riskyCommands ?? []) appendLedger("progress", `위험 명령 경고: ${item.matches.join(", ")}: ${item.command}`);
if ((result?.subagents ?? []).length > 0) appendLedger("progress", `하위 에이전트 경고: ${result.threadId} ${result.subagents.length}개`);
for (const warning of result?.warnings ?? []) {
  if (/^(네트워크 명령 감지|위험 명령 감지|하위 에이전트 \d+개)/.test(warning)) continue;
  appendLedger("progress", `래퍼 경고: ${warning}`);
}

console.log(
  `codex-task run exit=${exitCode} status=${result?.status ?? "-"} thread=${result?.threadId ?? "-"} commit=${result?.commit ?? "-"} tokens=${result?.usage?.totalTokens?.total_tokens ?? "-"} subagents=${result?.usage?.subagentCount ?? "-"}`
);
console.log(`reason: ${result?.reason ?? ((proc.stdout || proc.stderr || proc.error?.message || "").trim() || "-")}`);
if (result?.report) {
  console.log(`tests: ${result.report.tests ?? "-"}`);
  console.log(`concerns: ${result.report.concerns ?? "none"}`);
}
for (const warning of result?.warnings ?? []) console.log(`warning: ${warning}`);
let next;
if (exitCode === EXIT.OK && role === "implement") {
  next = args.thread
    ? `검수로: codex-task review --kind task --task ${task} --base <진행 기록의 "Task ${task}: base" 값>`
    : `검수로: codex-task review --kind task --task ${task} --base ${head.slice(0, 7)}`;
} else if (exitCode === EXIT.OK && role === "final-fix") {
  next = `재검수로: codex-task review --kind rereview --task final --base ${head.slice(0, 7)} --findings <final-fix-findings.md>`;
} else if (exitCode === EXIT.OK) {
  next = `재검수로: codex-task review --kind rereview --task ${task} --base ${head.slice(0, 7)} --findings ${args.findings ?? "<지적 파일>"}`;
} else if (exitCode === EXIT.STOPPED) {
  next = "Codex가 멈췄다(NEEDS_CONTEXT 또는 BLOCKED): 스킬의 'Codex가 멈췄을 때'를 따른다";
} else {
  next = "멈추고 보고한다: progress.md에 '멈춤:' 줄을 쓰고 사용자에게 알린다(스킬 참고)";
}
if (result?.status === "DONE_WITH_CONCERNS") next = `우려를 먼저 읽는다. ${next}`;
console.log(`next: ${next}`);
process.exit(exitCode);
```

- [ ] **Step 8: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/codex-task.test.mjs plugin/scripts/test/task-prompt.test.mjs`
Expected: PASS

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 9: 커밋한다**

```bash
git add plugin/scripts/lib/task-prompt.mjs plugin/scripts/codex-task.mjs plugin/scripts/test/task-prompt.test.mjs plugin/scripts/test/codex-task.test.mjs
git commit -m "feat(plugin): add codex-task to build prompts, run the wrapper, prepare reviews and write ledger lines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 15: 두 스킬을 새 규칙과 작업 스크립트에 맞춘다

**Files:**
- Modify: `plugin/skills/codex-execution/SKILL.md` (전체 교체)
- Modify: `plugin/skills/codex-planning/SKILL.md` (전체 교체)
- Test: `plugin/scripts/test/skills.test.mjs`

**Interfaces:**
- Consumes: `codex-task.mjs`의 `run`, `review`, `ledger` (Task 14), 래퍼의 `limits` (Task 13), 진행 기록 줄 형식(명세 16.1절)

- [ ] **Step 1: 실패하는 테스트를 더한다**

`plugin/scripts/test/skills.test.mjs` 끝에 더한다:

```js
test("실행 스킬은 작업 스크립트, 한도 확인, 멈춤과 재개, 사람 확인 규칙을 담는다", () => {
  const skill = read("codex-execution", "SKILL.md");
  for (const phrase of ["codex-task.mjs", "limits --cwd <저장소> --phase execute", "멈춤:", "이어서 진행", "사람 확인", "Final review:", "Final re-review:", "Usage log:", "Broker: closed", "[개발 중 · 큰 문제]"]) {
    assert.ok(skill.includes(phrase), phrase);
  }
});

test("계획 스킬은 한도 확인, 계획 검토 요청 줄, 멈춤과 재개 규칙을 담는다", () => {
  const skill = read("codex-planning", "SKILL.md");
  for (const phrase of ["limits --cwd <저장소> --phase plan", "계획 검토: 요청", "멈춤:", "이어서 진행", "Plan: committed", "Plan review:", "[기획 · 큰 문제]"]) {
    assert.ok(skill.includes(phrase), phrase);
  }
});

test("지시문 틀에는 래퍼가 붙이는 공통 규칙을 넣지 않는다", () => {
  for (const [name, files] of Object.entries(CODEX_PROMPTS)) {
    for (const file of files) assert.doesNotMatch(read(name, file), /Workflow rules \(always apply\)/, `${name}/${file}`);
  }
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/skills.test.mjs`
Expected: 새 테스트 두 개 FAIL

- [ ] **Step 3: `codex-execution/SKILL.md`를 교체한다**

`plugin/skills/codex-execution/SKILL.md` 전체를 다음으로 바꾼다:

````markdown
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
     - 정확성이나 범위에 관한 우려면, 우려를 지적으로 적은 파일로 같은 대화를 이어가 먼저 해결하게 한다: `codex-task run --role fix --task <N> --round 0 --thread <ID> --findings <파일>`. 이 처리는 수정 라운드에 세지 않는다.
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
  4. 재검수: `codex-task run`의 `next:`가 가리키는 `codex-task review --kind rereview --task <N> --base <수정 전 HEAD> --findings <지적 파일>`. 작은 수정은 `--model haiku`, 그 밖에는 `sonnet`이다.
  5. `codex-task ledger --text "Task <N>: fix round <R>/5 (<X> addressed, <Y> open — <지적 한 줄들>; commits <a7>..<b7>)"`.
- 5라운드 뒤 남은 지적은 마스터가 판정한다.
  - 검수자가 틀렸거나 다툼이 있으면 `Task <N>: parked — <지적> — Ruling: <이유> — <틀렸을 때 비용>`으로 보류한다.
  - 실제 문제지만 뒤 작업이 기대지 않으면 같은 형식으로 보류한다.
  - 뒤 작업이 기대는 문제면 막힘을 푸는 가장 작은 변경을 판정해 기록하고, 다음 작업 맥락에 담는다.
  - 어느 쪽으로 가도 추측뿐이면 멈춘다.
- 검수 지적에 대한 판정은 루프 상한에서만 한다.

## 마무리

1. **최종 검수:** `codex-task review --kind final --base $(git merge-base main HEAD)`를 돌리고, 출력대로 `opus` 서브에이전트를 보낸다. 끝나면 `codex-task ledger --text "Final review: <결과> — findings <파일 또는 none>"`.
2. **최종 수정 (지적이 있을 때, 한 번만):**
   - 지적을 `final-fix-findings.md`에 저장한다.
   - `codex-task run --role final-fix --findings <final-fix-findings.md> --diff <1번 출력의 package= 파일>`을 돌린다.
   - 재검수를 한 번만 한다: `codex-task review --kind rereview --task final --base <수정 전 HEAD> --findings <final-fix-findings.md>`, 모델은 `sonnet`.
   - 끝나면 `codex-task ledger --text "Final re-review: <결과>"`. 남은 지적은 판정해서 기록한다. 두 번째 수정은 없다.
3. **최종 보고:** 첫 줄은 `[배포 · 확인 필요]`이고, 핵심 세 줄과 `docs/reports/` 아래 보고 파일 경로를 쓴다. 보고 파일에 넣을 것:
   - "내가 내린 판정": `planning.md`와 `progress.md`의 `Ruling:` 줄 전부를 순서대로, 틀렸을 때 비용과 함께
   - "사람 확인" 체크 목록: `사람 확인:` 줄과 경고 줄(`네트워크 경고:`, `위험 명령 경고:`, `하위 에이전트 경고:`, `래퍼 경고:`)
   - Codex 사용량: `node <사용량 합계> <진행 기록 폴더>`의 호출 수, 실패 수, 정정 수, 토큰(메인, 하위 에이전트, 합계), 주간 한도 처음→끝
   - 사용자에게 Claude 주간 사용률을 받아 `usage-checkpoints.md`에 `측정점 3 (구현 직후)`로 적는다.
4. **사용량 기록:** `workflow/usage-log.md`에 합계 한 줄을 쓰고 커밋한다. 커밋 뒤 `codex-task ledger --text "Usage log: commit <해시>"`.
   - 날짜, 기능, 작업 규모
   - 수정 루프 횟수: 작업별 라운드 합. 최종 수정이 있었으면 1을 더한다.
   - Claude 사용량: 측정점 1 → 측정점 3
   - Codex 사용량: 합계의 주간 처음 → 끝
   - 메모: 측정점 2 값이 있으면 그 값, Codex 총 토큰
5. 진행 기록 폴더는 지우지 않는다.
6. **브로커 닫기:** Codex 작업이 모두 끝난 뒤 Codex 브로커를 닫는다: `node <래퍼> shutdown --cwd <저장소>`. 브로커는 저장소마다 하나씩 떠서 래퍼 호출이 재사용하고, 닫으면 그 저장소의 Codex 앱 서버도 함께 닫힌다.
   - 종료 코드 0: 닫았거나 닫을 브로커가 없다. `codex-task ledger --text "Broker: closed"`.
   - 종료 코드 3: 브로커가 끝나지 않았거나 종료를 확인하지 못했다. 다시 시도하거나 프로세스를 끝내지 말고, 출력의 PID와 함께 사용자에게 보고한다.
7. 이후 QA, 위키, 병합은 프로젝트 규칙을 따른다. 병합 방식 선택은 `superpowers:finishing-a-development-branch`를 쓴다.

## 하지 않는 것

- `superpowers:subagent-driven-development`, `superpowers:executing-plans`, `superpowers:writing-plans`를 부르지 않는다.
- 코드나 계획을 직접 고치지 않는다. Codex 호출이 실패해도 대신 구현하지 않는다.
- 진행 기록 폴더를 지우지 않는다.
````

- [ ] **Step 4: `codex-planning/SKILL.md`를 교체한다**

`plugin/skills/codex-planning/SKILL.md` 전체를 다음으로 바꾼다:

````markdown
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
- `usage-checkpoints.md`: Claude 사용률
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
- **시간 초과:** 종료 코드 3이고 이유에 "제한 시간"이 있으면 Codex가 띄운 명령이 아직 돌고 있을 수 있다. 래퍼는 중단 뒤 2분 동안 바뀐 파일을 결과의 `lateChanges`에 남긴다. 이 목록과 함께 멈추고, 사용자가 확인하기 전에는 래퍼를 다시 부르지 않는다.

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
2. 사용자에게 알린다. 첫 줄은 `[기획 · 큰 문제]`이고, 멈춘 이유, 재개 조건, 그리고 "조건이 풀리면 새 세션에서 '이어서 진행'이라고 입력해 주세요"를 쓴다.

## 이어서 진행

새 세션에서 사용자가 "이어서 진행"이라고 하면 진행 기록 폴더를 찾는다. `progress.md`가 있으면 `llm-workflow:codex-execution`의 "이어서 진행"으로 넘어간다. 없으면 `planning.md`를 읽고 이 스킬의 해당 단계부터 한다.

1. 마지막 줄이 `멈춤:`이면 재개 조건부터 확인한다.
   - 한도 멈춤이면 `node <래퍼> limits --cwd <저장소> --phase plan`을 돌리고, 4면 다시 멈춘다.
   - 조건이 풀렸으면 `재개: <시각>`을 쓰고 멈춤 줄의 다음 명령으로 이어간다.
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

1. 현재 브랜치가 main이면 멈추고 보고한다.
2. `node <래퍼> check --cwd <저장소>`를 돌린다. 0이 아니면 "멈출 때"를 따른다.
3. `node <래퍼> limits --cwd <저장소> --phase plan`을 돌린다. 4면 시작하지 않고 출력의 풀리는 시각과 함께 "멈출 때"를 따른다. 5면 "멈출 때"를 따른다.
4. 사용자에게 Claude 주간 사용률을 받아 `usage-checkpoints.md`에 `측정점 1 (계획 작성 직전): <날짜 시각> Claude <N>%`로 적는다. Codex 사용량은 래퍼가 자동으로 기록한다.

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
  - 같은 메시지에서 Claude 주간 사용률을 받아 `usage-checkpoints.md`에 `측정점 2 (계획 검토 관문)`으로 적는다.
  - 승인되면 실행 방식이나 worktree를 묻지 않고 `llm-workflow:codex-execution`을 부른다.
- **그 줄이 없으면:** 관문 없이 바로 `llm-workflow:codex-execution`을 부른다. Opus 검수가 사용자 검토를 대신한다.

## 하지 않는 것

- `superpowers:writing-plans`와 `superpowers:subagent-driven-development`를 부르지 않는다.
- 계획 파일을 직접 고치지 않는다. Codex 호출이 실패해도 대신 쓰지 않는다.
````

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/skills.test.mjs`
Expected: PASS

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 6: 커밋한다**

```bash
git add plugin/skills/codex-execution/SKILL.md plugin/skills/codex-planning/SKILL.md plugin/scripts/test/skills.test.mjs
git commit -m "feat(plugin): move the skills onto codex-task, limit checks, stop and resume lines, and the human-check list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: 프로젝트 템플릿

**Files:**
- Modify: `project-template/CLAUDE.md` (전체 교체)
- Modify: `project-template/.gitignore`
- Test: `plugin/scripts/test/template.test.mjs`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`plugin/scripts/test/template.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PLUGIN_ROOT } from "../lib/pins.mjs";

const template = path.resolve(PLUGIN_ROOT, "..", "project-template");
const read = (name) => fs.readFileSync(path.join(template, name), "utf8");

test("템플릿은 래퍼가 관리하는 .codex/를 git에서 뺀다", () => {
  assert.match(read(".gitignore"), /^\.codex\/$/m);
});

test("템플릿 규칙은 메시지, 명세, 이어서 진행, 권한 규칙을 담는다", () => {
  const claude = read("CLAUDE.md");
  for (const phrase of [
    "[명세 3/6]",
    "[개발 중 · 큰 문제]",
    "선택지와 추천안 한 줄",
    "docs/reports/",
    "짧은 체크 목록",
    "출력 인코딩, 줄 나누기, 반올림, 표기 예시",
    "계획 검토: 요청",
    "이어서 진행",
    "권한 문제로 막히면 우회하지 않는다",
    "사람 확인",
    "`.codex/`는 llm-workflow 래퍼가 관리하는"
  ]) {
    assert.ok(claude.includes(phrase), phrase);
  }
  assert.doesNotMatch(claude, /권한 문제로 막히면 우회하지 말고 멈춘 뒤 사용자에게 알린다/);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/template.test.mjs`
Expected: FAIL

- [ ] **Step 3: `.gitignore`에 한 줄을 더한다**

`project-template/.gitignore` 끝에 더한다:

```
.codex/
```

- [ ] **Step 4: `project-template/CLAUDE.md`를 교체한다**

```markdown
# 프로젝트 규칙

이 프로젝트는 LLM_WorkFlow 저장소의 에이전트 워크플로우로 작업한다.

## 프로젝트 정보

- 이름: (프로젝트 이름)
- 분야: (로블록스 / 웹 / 데스크톱 앱 등)
- 한 줄 설명: (무엇을 만드는지)

## 소통

- 사용자와는 한국어로 대화한다.
- 명세, 계획, 위키 문서는 한국어로 쓴다.
- 사용자는 모바일로 답하는 경우가 많고, 몇 시간씩 답하지 못할 때도 있다.
- 메시지 첫 줄에 단계와 성격을 표시한다. 예: `[명세 3/6]`, `[기획 · 확인 필요]`, `[개발 중 · 큰 문제]`, `[배포 · 확인 필요]`.
- 질문은 선택지와 추천안 한 줄로 한다. 물을 것이 여러 개면 한 번에 모아서 묻는다.
- 보고는 핵심 세 줄로 한다. 자세한 내용은 `docs/reports/` 아래 파일로 남기고, 세 줄 끝에 그 파일 경로를 적는다.
- 배포(병합) 때 사용자가 확인할 항목은 짧은 체크 목록으로 준다. "사람 확인" 항목, 경고(네트워크, 위험 명령, 하위 에이전트), 판정 목록을 넣는다.

## 명세

- 명세를 쓸 때 출력 인코딩, 줄 나누기, 반올림, 표기 예시 같은 경계 조건을 정했는지 확인한다.
- 사용자가 계획 검토를 원하면 명세 머리말에 `계획 검토: 요청` 줄을 넣는다. 이 줄이 없으면 계획은 검수만 거쳐 바로 실행으로 넘어간다.

## 이어서 진행

- 사용자가 새 세션에서 "이어서 진행"이라고 하면 `.superpowers/sdd/` 아래 진행 기록을 찾는다. `progress.md`가 있으면 `llm-workflow:codex-execution`의 "이어서 진행"을, 없으면 `planning.md`를 보고 `llm-workflow:codex-planning`의 "이어서 진행"을 따른다.

## 안전 규칙

- main 브랜치에 직접 커밋하지 않는다. 모든 작업은 작업 브랜치에서 한다.
- 저장소 밖의 파일을 만들거나 고치지 않는다.
- `.env`, `secrets/` 같은 비밀 정보는 읽지 않는다.
- 실제 비밀 정보는 프로젝트 폴더 안에 두지 않는다.
- 권한 문제로 막히면 우회하지 않는다. 그 일 없이 판정할 수 있으면 판정과 이유를 기록하고, 배포 때 "사람 확인" 항목으로 넘긴다. 그 일 없이는 진행할 수 없을 때만 멈추고 사용자에게 알린다.
- 테스트와 오래 걸리는 명령에는 제한 시간을 둔다. 프로세스를 끝내야 할 때는 자기가 띄운 프로세스의 번호(PID)로만 끝내고, 프로그램 이름으로 한꺼번에 끝내지 않는다. 그래도 안 되면 멈추고 사용자에게 보고한다.
- push와 merge는 사용자 승인을 받은 뒤에만 한다.
- 저장소를 새로 만들면 `git config core.hooksPath .githooks`를 한 번 실행해 main push 차단 훅을 켠다.
- `.codex/`는 llm-workflow 래퍼가 관리하는 Codex 설정 폴더다. 직접 고치지 않는다.

## 위키

- 프로젝트 구조를 파악할 때는 `docs/wiki/index.md`에서 시작해 필요한 문서만 읽는다.
- 위키는 QA까지 끝난 뒤 한 번 갱신한다. 코드 세부는 쓰지 않고 구조, 흐름, 결정의 이유만 쓴다.

## 사용량 기록

- 기능 하나를 마치면 `workflow/usage-log.md`에 한 줄을 추가한다: 날짜, 기능 이름, 작업 규모, 수정 루프 횟수.
- 그다음 사용자에게 Claude·Codex 사용량 수치를 물어 같은 줄에 채운다.
```

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `node --test plugin/scripts/test/template.test.mjs`
Expected: PASS

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

- [ ] **Step 6: 커밋한다**

```bash
git add project-template/CLAUDE.md project-template/.gitignore plugin/scripts/test/template.test.mjs
git commit -m "feat(template): add message, spec, resume and permission rules and ignore the wrapper-managed .codex folder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: 연결부 점검 항목 추가

**Files:**
- Modify: `plugin/scripts/lib/check-eval.mjs`
- Modify: `plugin/scripts/codex-check.mjs` (전체 교체)
- Test: `plugin/scripts/test/check-eval.test.mjs`

**Interfaces:**
- Produces:
  - `evaluateBoundary(testsLine, { outsideFileExists, gitFileExists, shimFileExists = false })`. 점검 출력에 `shim_write`가 있을 때만 보정 모듈 폴더 쓰기를 판정한다.
  - 연결부 점검 14항목. 10번은 마지막(브로커 정리)이고, 출력은 번호순이다.

**명세 17절과 다른 점(마스터 판정):**
- 12번(보호 경로)은 Codex에게 보호 경로를 바꾸게 하지 않는다. 공통 규칙이 이를 금지하므로 Codex가 거부하면 점검이 흔들린다. 대신 점검 스크립트가 `CLAUDE.md`를 바꾼 뒤, Codex에게 그 파일을 보고만 하게 한다(같은 대화 이어가기). 이렇게 래퍼의 대조와 커밋 거부를 확인한다.
- `.codex/config.toml` 변경은 단위 테스트(Task 12)로 확인한다.
- 13번(외부 연결 도구)은 1번의 `check` 출력("외부 연결 도구 0개")으로 판정한다. `check`가 `mcpServerStatus/list`로 코드 확인을 하기 때문이다.

- [ ] **Step 1: 실패하는 테스트를 더한다**

`plugin/scripts/test/check-eval.test.mjs` 끝에 더한다:

```js
test("보정 모듈 폴더 쓰기 결과가 있으면 함께 판정한다", () => {
  const withShim = '{"outside_write": "denied", "git_write": "denied", "shim_write": "denied", "network": "denied"}';
  const ok = evaluateBoundary(withShim, { outsideFileExists: false, gitFileExists: false, shimFileExists: false });
  assert.equal(ok.pass, true);
  assert.match(ok.detail, /보정 모듈 폴더 쓰기도 거부됨/);
  const allowed = '{"outside_write": "denied", "git_write": "denied", "shim_write": "allowed", "network": "denied"}';
  const bad = evaluateBoundary(allowed, { outsideFileExists: false, gitFileExists: false });
  assert.equal(bad.pass, false);
  assert.match(bad.detail, /보정 모듈 폴더 쓰기가 허용됨/);
  assert.equal(evaluateBoundary(withShim, { outsideFileExists: false, gitFileExists: false, shimFileExists: true }).pass, false);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test plugin/scripts/test/check-eval.test.mjs`
Expected: 새 테스트 FAIL

- [ ] **Step 3: `evaluateBoundary`를 고친다**

`plugin/scripts/lib/check-eval.mjs`의 `evaluateBoundary`를 다음으로 바꾼다:

```js
export function evaluateBoundary(testsLine, { outsideFileExists, gitFileExists, shimFileExists = false }) {
  const text = String(testsLine ?? "");
  let probe = null;
  try {
    probe = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    probe = null;
  }
  if (!probe || typeof probe !== "object") return { pass: false, detail: `점검 출력을 읽을 수 없습니다: ${text || "없음"}`, networkAllowed: null };

  // Windows unelevated 샌드박스는 네트워크를 막지 못한다. 파일 경계만 판정하고 네트워크는 기록만 한다.
  const networkAllowed = probe.network === "allowed";
  const shimChecked = "shim_write" in probe;
  const problems = [];
  if (probe.outside_write !== "denied" || outsideFileExists) problems.push("저장소 밖 쓰기가 허용됨");
  if (probe.git_write !== "denied" || gitFileExists) problems.push(".git 쓰기가 허용됨");
  if (shimChecked && (probe.shim_write !== "denied" || shimFileExists)) problems.push("보정 모듈 폴더 쓰기가 허용됨");
  if (problems.length > 0) return { pass: false, detail: problems.join(", "), networkAllowed };
  const network = networkAllowed ? "허용됨 (알려진 한계: Windows unelevated 샌드박스)" : "거부됨";
  const shimNote = shimChecked ? ", 보정 모듈 폴더 쓰기도 거부됨" : "";
  return { pass: true, detail: `저장소 밖 쓰기와 .git 쓰기가 거부됨${shimNote}; 네트워크: ${network}`, networkAllowed };
}
```

Run: `node --test plugin/scripts/test/check-eval.test.mjs`
Expected: PASS

- [ ] **Step 4: `codex-check.mjs`를 교체한다**

`plugin/scripts/codex-check.mjs` 전체를 다음으로 바꾼다:

```js
#!/usr/bin/env node
// 연결부 점검: Codex CLI, Codex 플러그인, Superpowers 버전, 요금제를 바꿀 때마다 실행한다.
// OS 임시 폴더에 작은 저장소를 만들고 래퍼를 통해 Codex를 실제로 부른다. 만든 폴더는 지우지 않는다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PINS, EXIT, USAGE_FILE, pluginPaths } from "./lib/pins.mjs";
import { evaluateBoundary, trailerModel } from "./lib/check-eval.mjs";
import { codexTmpDir } from "./lib/project-config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.join(here, "codex-run.mjs");
const outsideDir = path.resolve(here, "..", ".check-outside");
const shimProbeFile = path.join(pluginPaths().shimDir, "llm-workflow-probe.txt");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "llm-workflow-check-"));
const repo = path.join(root, "repo");
const workspace = path.join(repo, ".superpowers", "sdd", "check");
const results = [];
const ITEM_COUNT = 14;

const REPORT_RULES = [
  "End your final message with exactly these five lines:",
  "STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>",
  "CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>",
  "COMMIT_MESSAGE: <one-line commit message, or none>",
  "TESTS: <command and its final result line, or none>",
  "CONCERNS: <text, or none>"
].join("\n");

const IMPLEMENT_PROMPT = [
  "You are the implementer for one small task in this repository. The design is approved: do not brainstorm and do not ask questions.",
  "Add a function `farewell(name)` to greet.py that returns `잘 가, {name}` (for example `farewell(\"코덱스\")` returns `잘 가, 코덱스`).",
  "Test first: add `test_farewell` to tests/test_greet.py, run `python -m unittest` and confirm it fails, then implement and confirm all tests pass.",
  "Do not commit and do not run any git command that writes. The wrapper commits the files you report.",
  "Use exactly `feat: 작별 인사 추가` as COMMIT_MESSAGE.",
  REPORT_RULES
].join("\n");

const RESUME_PROMPT = [
  "Do not change any files and do not run any commands.",
  "Earlier in this same conversation you added one function to greet.py.",
  "End your final message with exactly these five lines:",
  "STATUS: DONE",
  "CHANGED_FILES: none",
  "COMMIT_MESSAGE: none",
  "TESTS: none",
  "CONCERNS: <only the exact name of the function you added earlier>"
].join("\n");

const PROTECTED_PROMPT = [
  "This is a protected-path check. Do not change any files and do not run any commands.",
  "End your final message with exactly these five lines:",
  "STATUS: DONE",
  "CHANGED_FILES: CLAUDE.md",
  "COMMIT_MESSAGE: chore: protected path check",
  "TESTS: none",
  "CONCERNS: none"
].join("\n");

const NETWORK_COMMAND_PROMPT = [
  "This is a network-command detection check. Do not change any files.",
  "Run this command exactly once and wait for it to finish (it may fail, that is fine): Invoke-WebRequest -UseBasicParsing -Method Head -Uri https://example.com | Select-Object -ExpandProperty StatusCode",
  "End your final message with exactly these five lines:",
  "STATUS: DONE",
  "CHANGED_FILES: none",
  "COMMIT_MESSAGE: none",
  "TESTS: <the command's output or error, one line>",
  "CONCERNS: none"
].join("\n");

const TEMP_PROMPT = [
  "This is a temporary-folder check. Do not change any files in this repository.",
  "Run this command exactly once and wait for it to finish:",
  "python -c \"import os, shutil, tempfile; d = tempfile.TemporaryDirectory(); open(os.path.join(d.name, 'f.txt'), 'w').write('x'); d.cleanup(); print('TD_OK' if not os.path.exists(d.name) else 'TD_LEFT'); p = tempfile.mkdtemp(); shutil.rmtree(p); print('MK_OK' if not os.path.exists(p) else 'MK_LEFT'); print('TMPDIR=' + tempfile.gettempdir())\"",
  "End your final message with exactly these five lines:",
  "STATUS: DONE",
  "CHANGED_FILES: none",
  "COMMIT_MESSAGE: none",
  "TESTS: <the three lines the command printed, joined with spaces, or the error>",
  "CONCERNS: none"
].join("\n");

const TIMEOUT_PROMPT = [
  "This is a timeout check. Do not change any files yourself.",
  "Run this command exactly once and wait for it to finish: python -c \"open('started.txt','w').write('x'); import time; time.sleep(90); open('late.txt','w').write('x')\"",
  "End your final message with exactly these five lines:",
  "STATUS: DONE",
  "CHANGED_FILES: late.txt",
  "COMMIT_MESSAGE: chore: late",
  "TESTS: none",
  "CONCERNS: none"
].join("\n");

const boundaryPrompt = (dir, shim) =>
  [
    "This is a sandbox boundary check. Do not change any files in this repository.",
    `Run this command exactly once and wait for it to finish: python boundary_probe.py "${dir}" "${shim}"`,
    "End your final message with exactly these five lines:",
    "STATUS: DONE",
    "CHANGED_FILES: none",
    "COMMIT_MESSAGE: none",
    "TESTS: <the single JSON line the command printed, copied exactly>",
    "CONCERNS: none"
  ].join("\n");

const BOUNDARY_PROBE = `import json
import os
import socket
import sys

outside = sys.argv[1]
shim = sys.argv[2] if len(sys.argv) > 2 else None
results = {}
try:
    with open(os.path.join(outside, "probe.txt"), "w", encoding="utf-8") as handle:
        handle.write("x")
    results["outside_write"] = "allowed"
except OSError:
    results["outside_write"] = "denied"
try:
    with open(os.path.join(".git", "llm-workflow-probe"), "w", encoding="utf-8") as handle:
        handle.write("x")
    results["git_write"] = "allowed"
except OSError:
    results["git_write"] = "denied"
if shim:
    try:
        with open(os.path.join(shim, "llm-workflow-probe.txt"), "w", encoding="utf-8") as handle:
            handle.write("x")
        results["shim_write"] = "allowed"
    except OSError:
        results["shim_write"] = "denied"
try:
    socket.create_connection(("example.com", 443), timeout=5).close()
    results["network"] = "allowed"
except OSError:
    results["network"] = "denied"
print(json.dumps(results))
`;

function git(...args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function write(relative, text) {
  const file = path.join(repo, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function setupRepo() {
  fs.mkdirSync(repo, { recursive: true });
  write("greet.py", '"""연결부 점검용 모듈."""\n\n\ndef greet(name):\n    return f"안녕, {name}"\n');
  write("tests/__init__.py", "");
  write(
    "tests/test_greet.py",
    'import unittest\n\nfrom greet import greet\n\n\nclass GreetTest(unittest.TestCase):\n    def test_greet(self):\n        self.assertEqual(greet("코덱스"), "안녕, 코덱스")\n\n\nif __name__ == "__main__":\n    unittest.main()\n'
  );
  write("boundary_probe.py", BOUNDARY_PROBE);
  write("CLAUDE.md", "# 연결부 점검 저장소 규칙\n");
  write(".gitignore", "__pycache__/\n");
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  git("config", "user.name", "llm-workflow-check");
  git("config", "user.email", "check@example.invalid");
  git("add", "-A");
  git("commit", "-q", "-m", "check: initial");
  git("switch", "-q", "-c", "feature/check");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });
}

function callWrapper(name, args, prompt) {
  const promptFile = path.join(workspace, `${name}-prompt.md`);
  const out = path.join(workspace, "codex-results", `${name}.json`);
  fs.writeFileSync(promptFile, prompt);
  const proc = spawnSync(
    process.execPath,
    [wrapper, ...args, "--cwd", repo, "--prompt-file", promptFile, "--workspace", workspace, "--out", out],
    { encoding: "utf8", timeout: 40 * 60_000 }
  );
  const result = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null;
  return { exitCode: proc.status, stderr: (proc.stderr ?? "").trim(), result };
}

function record(name, pass, detail) {
  results.push({ name, pass, detail });
}

function printHeader() {
  let codexVersion = "알 수 없음";
  try {
    codexVersion = execSync("codex --version", { encoding: "utf8" }).trim();
  } catch {
    // 버전을 못 읽어도 점검은 계속한다. 1번 환경 점검이 실패를 알린다.
  }
  console.log("연결부 점검");
  console.log(`- Codex CLI: ${codexVersion}`);
  console.log(`- Codex 플러그인(Claude Code): ${PINS.codexPlugin.version} (${PINS.codexPlugin.sha})`);
  console.log(`- Superpowers(Claude Code): ${PINS.claudeSuperpowers.version} (${PINS.claudeSuperpowers.sha})`);
  console.log(`- Superpowers(Codex): ${PINS.codexSuperpowers.version}`);
  console.log(`- Node: ${process.version}`);
  console.log(`- 임시 저장소: ${repo}`);
}

function finishAll() {
  const order = (item) => Number.parseInt(item.name, 10) || 99;
  results.sort((a, b) => order(a) - order(b));
  console.log("");
  for (const item of results) console.log(`[${item.pass ? "통과" : "실패"}] ${item.name} — ${item.detail}`);
  console.log("");
  console.log(`임시 저장소는 지우지 않았습니다: ${root}`);
  process.exit(results.length === ITEM_COUNT && results.every((item) => item.pass) ? 0 : 1);
}

function main() {
  setupRepo();
  printHeader();

  const check = spawnSync(process.execPath, [wrapper, "check", "--cwd", repo], { encoding: "utf8", timeout: 5 * 60_000 });
  const checkLine = (check.stdout || check.stderr || "").trim();
  const configWritten = fs.existsSync(path.join(repo, ".codex", "config.toml"));
  record("1. 환경 점검", check.status === EXIT.OK && configWritten, `${checkLine} 프로젝트 Codex 설정=${configWritten ? "있음" : "없음"}`);
  record("13. 외부 연결 도구", check.status === EXIT.OK && /외부 연결 도구 0개/.test(checkLine), /외부 연결 도구[^)]*\)?/.exec(checkLine)?.[0] ?? checkLine);
  if (check.status !== EXIT.OK) return finishAll();

  const limits = spawnSync(process.execPath, [wrapper, "limits", "--cwd", repo, "--phase", "call"], { encoding: "utf8", timeout: 2 * 60_000 });
  const limitsOut = (limits.stdout || limits.stderr || "").trim();
  record(
    "14. 한도 확인",
    [EXIT.OK, EXIT.LIMIT].includes(limits.status) && /^codex-run limits status=(ok|short) plan=\S+/m.test(limitsOut) && /^window=\d+m /m.test(limitsOut),
    limitsOut.split(/\r?\n/).join(" | ")
  );

  // 2~12번 중 예외가 나도 10번(브로커 정리)은 반드시 한다.
  try {
    runCodexItems();
  } catch (error) {
    record("점검 중 예외", false, String(error?.stack ?? error));
  }
  closeBroker();
  finishAll();
}

function runCodexItems() {
  const impl = callWrapper("implement", ["start", "--role", "check", "--task", "1"], IMPLEMENT_PROMPT);
  const committed = impl.result?.commit ? git("show", "--name-only", "--format=", "HEAD").split(/\r?\n/).filter(Boolean).sort() : [];
  const model = impl.result?.commit ? trailerModel(git("log", "-1", "--format=%B")) : null;
  const filesOk = JSON.stringify(committed) === JSON.stringify(["greet.py", "tests/test_greet.py"]);
  record(
    "2. 구현과 커밋",
    impl.exitCode === EXIT.OK && filesOk && model !== null && model !== "unknown-model",
    `exit=${impl.exitCode} 커밋 파일=${committed.join(", ") || "-"} 모델=${model ?? "-"} ${impl.result?.reason ?? impl.stderr}`
  );

  const subject = impl.result?.commit ? git("log", "-1", "--format=%s") : "";
  const unittest = spawnSync("python", ["-m", "unittest", "-q"], { cwd: repo, encoding: "utf8", timeout: 2 * 60_000 });
  record("3. 한글", subject === "feat: 작별 인사 추가" && unittest.status === 0, `커밋 제목=${subject || "-"} 테스트 종료 코드=${unittest.status}`);

  if (impl.result?.threadId) {
    const resume = callWrapper("resume", ["resume", "--role", "check", "--task", "1", "--round", "1", "--thread", impl.result.threadId], RESUME_PROMPT);
    const answer = String(resume.result?.report?.concerns ?? "").replace(/[`*]/g, "").trim();
    record(
      "4. 대화 이어가기",
      resume.exitCode === EXIT.OK && resume.result?.threadId === impl.result.threadId && answer === "farewell",
      `exit=${resume.exitCode} thread=${resume.result?.threadId ?? "-"} 답=${answer || "-"}`
    );

    // 12번: 점검 스크립트가 CLAUDE.md를 바꾸고, Codex에게는 그 파일을 보고만 하게 한다. 래퍼가 커밋을 거부해야 한다.
    const before = git("rev-parse", "HEAD");
    fs.appendFileSync(path.join(repo, "CLAUDE.md"), "- 보호 경로 점검 중에 바꾼 줄\n");
    const guarded = callWrapper("protected", ["resume", "--role", "check", "--task", "12", "--round", "1", "--thread", impl.result.threadId], PROTECTED_PROMPT);
    const after = git("rev-parse", "HEAD");
    git("checkout", "--", "CLAUDE.md");
    record(
      "12. 보호 경로",
      guarded.exitCode === EXIT.FAILED && String(guarded.result?.reason ?? "").startsWith("보호 경로 변경: CLAUDE.md") && before === after,
      `exit=${guarded.exitCode} 커밋 변화=${before === after ? "없음" : "있음"} ${guarded.result?.reason ?? guarded.stderr}`
    );
  } else {
    record("4. 대화 이어가기", false, "2번에서 대화 ID를 얻지 못해 건너뜀");
    record("12. 보호 경로", false, "2번에서 대화 ID를 얻지 못해 건너뜀");
  }

  const bad = callWrapper("bad-model", ["start", "--role", "check", "--task", "5", "--model", "no-such-model-xyz"], "Reply with OK.");
  record(
    "5. 실패 판별",
    bad.exitCode === EXIT.FAILED && String(bad.result?.reason ?? "").startsWith("Codex 호출 실패") && bad.result?.corrections === 0,
    `exit=${bad.exitCode} ${bad.result?.reason ?? bad.stderr}`
  );

  const outsideFile = path.join(outsideDir, "probe.txt");
  const gitFile = path.join(repo, ".git", "llm-workflow-probe");
  if (fs.existsSync(outsideFile) || fs.existsSync(shimProbeFile)) {
    record("6. 샌드박스 경계", false, `이전 실행이 남긴 파일을 먼저 지워 주세요: ${[outsideFile, shimProbeFile].filter((file) => fs.existsSync(file)).join(", ")}`);
  } else {
    // 양성 대조: 샌드박스 밖에서도 접속이 안 되는 PC라면 네트워크 결과는 판정할 수 없다. 네트워크는 정보일 뿐 합격 조건이 아니다.
    // 파이썬의 timeout은 DNS 조회를 묶지 못하므로 프로세스에도 15초 상한을 둔다. 넘기면 접속 불가로 본다.
    const pcReachesNetwork =
      spawnSync("python", ["-c", "import socket; socket.create_connection(('example.com', 443), timeout=5).close()"], {
        encoding: "utf8",
        timeout: 15_000
      }).status === 0;
    const probe = callWrapper("boundary", ["start", "--role", "check", "--task", "6"], boundaryPrompt(outsideDir, pluginPaths().shimDir));
    const verdict =
      probe.exitCode === EXIT.OK
        ? evaluateBoundary(probe.result?.report?.tests, {
            outsideFileExists: fs.existsSync(outsideFile),
            gitFileExists: fs.existsSync(gitFile),
            shimFileExists: fs.existsSync(shimProbeFile)
          })
        : { pass: false, detail: `exit=${probe.exitCode} ${probe.result?.reason ?? probe.stderr}` };
    const shimChecked = /보정 모듈 폴더 쓰기도 거부됨/.test(verdict.detail);
    record(
      "6. 샌드박스 경계",
      verdict.pass && shimChecked,
      pcReachesNetwork ? verdict.detail : `${verdict.detail} (이 PC에서 외부 접속이 안 되어 네트워크 결과는 판정 불가)`
    );
  }

  const net = callWrapper("network", ["start", "--role", "check", "--task", "7"], NETWORK_COMMAND_PROMPT);
  const detected = net.result?.networkCommands?.length ?? 0;
  record(
    "7. 네트워크 명령 탐지",
    net.exitCode === EXIT.OK && detected >= 1 && (net.result?.warnings?.length ?? 0) >= 1,
    `exit=${net.exitCode} 감지=${detected} ${net.result?.warnings?.find((warning) => /네트워크/.test(warning)) ?? net.result?.reason ?? net.stderr}`
  );

  const temp = callWrapper("temp", ["start", "--role", "check", "--task", "11"], TEMP_PROMPT);
  const tempTests = String(temp.result?.report?.tests ?? "");
  const tmpDir = codexTmpDir(repo);
  const leftovers = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : [];
  record(
    "11. 임시 폴더",
    temp.exitCode === EXIT.OK &&
      /TD_OK/.test(tempTests) &&
      /MK_OK/.test(tempTests) &&
      /codex-tmp/i.test(tempTests) &&
      leftovers.length === 0 &&
      (temp.result?.tempCleanup?.failed?.length ?? 0) === 0,
    `exit=${temp.exitCode} ${tempTests || temp.result?.reason || temp.stderr} 남은 항목=${leftovers.length}`
  );

  const usageFile = path.join(workspace, USAGE_FILE);
  const lines = fs.existsSync(usageFile)
    ? fs.readFileSync(usageFile, "utf8").split(/\r?\n/).filter(Boolean).map((raw) => JSON.parse(raw))
    : [];
  const okLines = lines.filter((item) => item.exitCode === EXIT.OK);
  const usageOk =
    okLines.length > 0 &&
    okLines.every((item) => item.tokens?.total_tokens > 0 && typeof item.weeklyEnd === "number" && typeof item.subagentCount === "number" && "totalTokens" in item);
  record("8. 사용량 기록", usageOk, `기록 ${lines.length}줄, 성공 호출 ${okLines.length}줄, 하위 에이전트 합계 ${okLines.reduce((sum, item) => sum + (item.subagentCount ?? 0), 0)}개`);

  // 9번은 마지막에 한다: 래퍼가 중단 뒤 2분을 기다리며 바뀐 파일을 기록하므로 호출이 오래 걸린다.
  const late = callWrapper("timeout", ["start", "--role", "check", "--task", "9", "--timeout-min", "0.5"], TIMEOUT_PROMPT);
  const lateExists = fs.existsSync(path.join(repo, "late.txt"));
  const startedExists = fs.existsSync(path.join(repo, "started.txt"));
  const lateDetected = late.result?.lateChanges?.includes("late.txt") === true;
  const interrupted = late.result?.interrupt?.interrupted === true;
  const reason = String(late.result?.reason ?? "");
  // 명령이 실제로 시작됐고(started.txt) 감시가 끝까지 돌았을 때만 통과한다. late.txt가 없다는 것만으로는 아무것도 증명하지 못한다.
  record(
    "9. 시간 초과 중단",
    late.exitCode === EXIT.FAILED &&
      reason.includes("제한 시간") &&
      interrupted &&
      Array.isArray(late.result?.lateChanges) &&
      /바뀐 파일 \d+개/.test(reason) &&
      startedExists &&
      (lateDetected || !lateExists),
    `exit=${late.exitCode} 중단=${interrupted} started.txt=${startedExists ? "있음" : "없음"} late.txt=${lateExists ? "있음" : "없음"} 탐지=${lateDetected ? "예" : "아니오"} (중단된 명령이 계속 도는 것은 알려진 한계) ${reason || late.stderr}`
  );
}

// 10번: 이 임시 저장소용으로 뜬 Codex 브로커를 닫는다. 점검 세션의 폴더가 아니라서 Codex 플러그인이 대신 닫아 주지 않는다.
function closeBroker() {
  const shutdown = spawnSync(process.execPath, [wrapper, "shutdown", "--cwd", repo], { encoding: "utf8", timeout: 60_000 });
  const shutdownLine = (shutdown.stdout || shutdown.stderr || "").trim();
  record(
    "10. 브로커 정리",
    shutdown.status === EXIT.OK && /^codex-run shutdown stopped=true exited=true /m.test(shutdownLine),
    shutdownLine || `exit=${shutdown.status} ${shutdown.error?.message ?? ""}`.trim()
  );
}

main();
```

- [ ] **Step 5: 단위 테스트를 돌린다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과

연결부 점검(실제 Codex)은 Task 18에서 마스터가 돌린다.

- [ ] **Step 6: 커밋한다**

```bash
git add plugin/scripts/lib/check-eval.mjs plugin/scripts/codex-check.mjs plugin/scripts/test/check-eval.test.mjs
git commit -m "feat(plugin): extend the connection check to 14 items (temp folder, protected path, apps tools, limits, shim boundary)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: 문서 정리와 배포 전 확인 (마스터가 직접 한다)

이 작업은 실제 Codex와 사용자 확인이 필요하므로 서브에이전트에게 맡기지 않고 마스터가 한다.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-stage3-cost-fixes-design.md` (17절 12·13번 문구, 상태 줄)
- Create: `docs/reports/2026-10-1X 비용 개선 구현 보고.md` (날짜는 쓰는 날)

- [ ] **Step 1: 명세의 17절을 실제 구현에 맞춘다**

12번과 13번 줄을 다음으로 바꾼다:

```markdown
| 12. 보호 경로 (새로) | 점검 스크립트가 `CLAUDE.md`를 바꾼 뒤 Codex에게 그 파일을 보고만 하게 하면 종료 코드 3, 커밋 없음. Codex에게 보호 경로를 직접 바꾸게 하지 않는다(공통 규칙과 충돌). `.codex/config.toml` 변경은 단위 테스트로 확인 |
| 13. 외부 연결 도구 (새로) | 1번의 `check`가 점검 대화의 `mcpServerStatus/list`로 `codex_apps` 서버와 그 도구가 0개인지 코드로 확인하고, 그 결과("외부 연결 도구 0개")로 판정한다. Codex에게 묻지 않는다 |
```

상태 줄을 `- 상태: 승인(2026-10-10), 구현 완료, 배포 전`으로 바꾼다.

- [ ] **Step 2: 전체 단위 테스트**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: 모두 통과. 테스트 수를 보고 파일에 적는다.

- [ ] **Step 3: 개발 사본의 연결부 점검 (Pro 환경)**

Run (백그라운드, 제한 40분): `node plugin/scripts/codex-check.mjs`
Expected: 14개 항목 모두 통과, 종료 코드 0. 실패 항목이 있으면 원인을 고치고 다시 돌린다.

점검이 끝난 뒤 남은 브로커가 없는지 확인한다(`~/.claude/plugins/data/codex-openai-codex/state/*/broker.json`의 PID).

- [ ] **Step 4: 흐름 확인 준비 (명세 1.3절 3번)**

`--plugin-dir`로 바뀐 스킬의 흐름(계획 작성, 작업 하나, 마무리, 멈춤과 재개)을 확인하려면 시험용 프로젝트에서 새 Claude 세션이 필요하다. 새 프로젝트 폴더를 만드는 일이므로 사용자 승인을 받는다. 그다음 사용자에게 다음을 안내한다: 세션 시작 명령(`claude --plugin-dir D:\Work\LLM_Project\LLM_WorkFlow-dev\plugin`), 시작 문장, 확인할 것.

- [ ] **Step 5: 구현 보고 파일을 쓰고 커밋한다**

보고 파일에 넣을 것:
- 작업별 커밋
- 단위 테스트 수
- 연결부 점검 14항목 결과
- Task 13 수동 확인 결과
- 흐름 확인 결과(또는 사용자 확인 대기)
- 남은 위험

```bash
git add docs/superpowers/specs/2026-10-10-stage3-cost-fixes-design.md docs/reports/
git commit -m "docs: record the cost-fix implementation results and align spec section 17 with the checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: 배포는 `superpowers:finishing-a-development-branch`로 사용자에게 묻는다**

배포(운영 폴더 main에 병합)는 사용자가 고른 뒤에 한다. 배포 후 운영 폴더에서 연결부 점검을 다시 돌린다. 재측정은 그 뒤 사용자 확인을 받아 시작한다.
