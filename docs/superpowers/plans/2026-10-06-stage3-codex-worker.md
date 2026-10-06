# 3단계 Codex 작업자 교체 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codex를 계획 작성자와 구현자로 쓰고 Claude가 검수하는 Claude Code 플러그인 `llm-workflow`(래퍼, 스킬 두 개, 연결부 점검 스크립트)를 이 저장소의 `plugin/`에 만들고, 설치와 버전 고정까지 마친다.

**Architecture:** 래퍼 `codex-run.mjs`만 공식 Codex 플러그인의 내부 라이브러리를 부른다. 판단 로직(보고 해석, 환경 점검, 변경 파일 비교와 커밋, 세션 기록 읽기, 처리 순서)은 `scripts/lib/`의 작은 모듈로 나누고 Codex 호출과 git, 파일 입출력은 주입받아 `node:test`로 시험한다. 스킬 두 개는 마스터(Claude)가 래퍼를 어떻게 부르고 검수를 어떻게 돌리는지 적은 문서와 Codex 지시문 틀이다.

**Tech Stack:** Node 24 (내장 모듈만, ESM `.mjs`), `node:test`, Git for Windows, Codex CLI 0.160.0, 공식 Codex 플러그인 1.0.4, Superpowers 6.4.1

**Spec:** `docs/superpowers/specs/2026-10-05-stage3-codex-worker-design.md` (근거 자료: `docs/2026-10-05 Codex 연결부 탐색 보고서.md`)

## 명세와 다르게 정한 것

계획을 쓰며 구체화한 결정이다. 계획 검토 때 함께 확인받는다.

1. 래퍼에 `--model` 선택 인자를 둔다. 연결부 점검의 "없는 모델로 부르면 종료 코드 3" 확인에 필요하다.
2. 진행 기록 폴더는 `<저장소>/.superpowers/sdd/` 아래여야 한다. 래퍼가 `.superpowers/sdd/.gitignore`(`*`)를 만들어 지시 파일과 결과 파일이 git 변경으로 잡히지 않게 한다.
3. `start`(새 대화)는 커밋되지 않은 변경이 없을 때만 실행한다. 변경이 있으면 실패(3)다. 누구의 변경인지 가릴 수 없기 때문이다.
4. `CHANGED_FILES`는 "마지막 커밋 이후 저장소의 모든 변경 파일"이다. 같은 작업에서 여러 번 이어가도 누적으로 보고한다.
5. 차례(turn)가 정상으로 끝났는데 한도 정보만 도달을 가리키면 결과를 버리지 않고 진행한다. 한도(4)는 차례가 실패했을 때만 판정한다.
6. 진행 기록 폴더의 사용량 합계를 출력하는 `codex-usage.mjs`를 더한다. 실행 스킬의 마무리 보고와 비교 보고서에 쓴다.
7. 로컬 마켓플레이스 등록을 위해 `plugin/.claude-plugin/marketplace.json`을 더한다.
8. 탐색 기록(`turn_context.sandbox_policy.exclude_tmpdir_env_var: false`)으로 보면 Codex 샌드박스는 OS 임시 폴더 쓰기도 허용하는 것으로 보인다. 그래서 점검 스크립트의 "저장소 밖 쓰기" 확인은 임시 폴더가 아닌 `plugin/.check-outside/`를 대상으로 한다. 결과는 Task 8에서 탐색 보고서에 기록한다.
9. 차례가 정상으로 끝났으면 Codex가 재시도한 일시 오류(재연결 등)는 실패로 보지 않고 결과의 transientError에 남긴다. 명세 3.3절 4번의 "오류 필드면 실패"를 좁힌 것이다.

## File Structure

| 파일 | 책임 |
|---|---|
| `plugin/.claude-plugin/plugin.json` | 플러그인 정보 (`llm-workflow`) |
| `plugin/.claude-plugin/marketplace.json` | 로컬 마켓플레이스 정보 (`llm-workflow-local`) |
| `plugin/.gitignore` | 점검 스크립트의 저장소 밖 쓰기 대상 폴더 제외 |
| `plugin/scripts/lib/pins.mjs` | 고정 버전, 경로, 종료 코드, 상수 |
| `plugin/scripts/lib/report.mjs` | Codex 보고 다섯 줄 해석, 정정 요청 문구 |
| `plugin/scripts/lib/environment.mjs` | 버전과 샌드박스 설정 점검 |
| `plugin/scripts/lib/git-changes.mjs` | 변경 파일 목록, 보고와 비교, 커밋 |
| `plugin/scripts/lib/rollout.mjs` | Codex 세션 기록에서 한 차례의 모델, 토큰, 한도, 오류 읽기 |
| `plugin/scripts/lib/usage.mjs` | 토큰 합산, `codex-calls.jsonl` 합계 |
| `plugin/scripts/lib/cli-args.mjs` | 래퍼 명령줄 인자 해석 |
| `plugin/scripts/lib/run.mjs` | 래퍼 처리 순서 (의존성 주입) |
| `plugin/scripts/lib/check-eval.mjs` | 점검 스크립트의 판정 함수 |
| `plugin/scripts/codex-run.mjs` | 래퍼 진입점 (실제 의존성 연결) |
| `plugin/scripts/codex-usage.mjs` | 사용량 합계 출력 |
| `plugin/scripts/codex-check.mjs` | 연결부 점검 |
| `plugin/scripts/test/*.test.mjs` | 단위 테스트 |
| `plugin/skills/codex-planning/` | 계획 작성 스킬과 지시문 틀 |
| `plugin/skills/codex-execution/` | 실행 스킬과 지시문 틀 |

## Global Constraints

- Node 24 내장 모듈만 쓴다. npm 패키지를 설치하지 않는다. 모든 스크립트는 ESM `.mjs`다.
- 테스트는 저장소 루트에서 `node --test "plugin/scripts/test/*.test.mjs"`로 돌린다.
- 고정값: Codex 플러그인(Claude Code 쪽) `codex@openai-codex` 1.0.4, 커밋 `807e03a` / Superpowers(Claude Code 쪽) `superpowers@claude-plugins-official` 6.4.1, 커밋 `5bf4e78` / Superpowers(Codex 쪽) 6.4.1.
- 종료 코드: 0 완료(커밋됨) / 2 Codex가 NEEDS_CONTEXT·BLOCKED 보고 / 3 실패 / 4 한도 도달 / 5 환경 점검 실패.
- Codex 보고 형식은 정확히 다섯 줄이다: `STATUS:`, `CHANGED_FILES:`, `COMMIT_MESSAGE:`, `TESTS:`, `CONCERNS:`. STATUS 값은 `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`.
- 기본 제한 시간 30분. 호출별 사용량 파일 이름 `codex-calls.jsonl`.
- 래퍼 커밋의 서명 줄: `Co-Authored-By: Codex <모델명> <noreply@openai.com>`. 모델명을 모르면 `unknown-model`.
- 공식 Codex 플러그인의 내부 라이브러리(`scripts/lib/codex.mjs`)는 `codex-run.mjs`에서만 불러온다.
- 문서와 스킬 본문, 코드 주석은 한국어로 쓴다. 주석은 파일 첫머리와 꼭 필요한 곳에만 짧게 둔다. Codex에게 보내는 지시문 틀은 영어로 쓴다(탐색에서 검증한 형식).
- 단위 테스트가 OS 임시 폴더에 만든 폴더는 테스트가 끝나면 지운다. 연결부 점검 스크립트가 만든 폴더는 지우지 않는다.
- 이 계획의 커밋은 작업 브랜치 `stage3-design`에 한다. main에 직접 커밋하지 않는다.

## Review Focus

1. Codex가 보고 줄을 마크다운으로 꾸미는 경우(`**STATUS:** DONE`, `- STATUS: DONE`, 값에 백틱): 정상으로 해석해야 한다. → Task 1 `parseReport` 테스트
2. Codex가 Windows 경로(`tests\test_greet.py`)나 `./` 접두어로 파일을 보고하는 경우: git 경로와 같은 것으로 비교해야 한다. → Task 1 테스트
3. 한글이나 공백이 든 파일 이름: 변경 목록과 커밋에서 깨지지 않아야 한다. → Task 3 통합 테스트
4. 같은 대화에 여러 차례가 쌓인 세션 기록: 이번 차례의 토큰과 한도만 읽어야 한다. → Task 4 테스트
5. 세션 기록 파일이 없거나 아직 다 써지지 않은 경우: 래퍼가 멈추지 않고 사용량만 비운 채 결과를 남겨야 한다. → Task 5 테스트

---

### Task 1: 플러그인 뼈대와 보고 해석

**Files:**
- Create: `plugin/.claude-plugin/plugin.json`
- Create: `plugin/.claude-plugin/marketplace.json`
- Create: `plugin/.gitignore`
- Create: `plugin/scripts/lib/pins.mjs`
- Create: `plugin/scripts/lib/report.mjs`
- Test: `plugin/scripts/test/report.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `pins.mjs`: `PINS`, `EXIT`, `DEFAULT_TIMEOUT_MIN`, `USAGE_FILE`, `ROLES`, `EFFORTS`, `defaultPaths(home?) -> { installedPlugins, codexLib, superpowersRoot, codexConfig, codexSessions }`
  - `report.mjs`: `STATUSES`, `REPORT_FIELDS`, `REPORT_TEMPLATE`, `isDone(status) -> boolean`, `normalizePath(p) -> string`, `parseReport(message) -> { ok: true, status, changedFiles: string[], commitMessage: string|null, tests: string, concerns: string|null } | { ok: false, error: string }`, `buildFormatCorrection(error) -> string`, `buildMismatchCorrection({ missing, extra }) -> string`

- [ ] **Step 1: 플러그인 정보 파일 세 개를 만든다**

`plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "llm-workflow",
  "version": "0.1.0",
  "description": "LLM_WorkFlow 3단계: Codex가 작성하고 Claude가 검수하는 계획·실행 스킬과 Codex 래퍼",
  "author": { "name": "nosphobia" }
}
```

`plugin/.claude-plugin/marketplace.json`:

```json
{
  "name": "llm-workflow-local",
  "description": "LLM_WorkFlow 저장소의 로컬 플러그인 마켓플레이스",
  "owner": { "name": "nosphobia" },
  "plugins": [
    {
      "name": "llm-workflow",
      "source": "./",
      "description": "Codex가 작성하고 Claude가 검수하는 계획·실행 스킬"
    }
  ]
}
```

`plugin/.gitignore`:

```
.check-outside/
```

- [ ] **Step 2: 고정값 모듈을 만든다**

`plugin/scripts/lib/pins.mjs`:

```js
// 3단계에서 고정한 버전과 경로, 래퍼의 상수. 버전을 올릴 때는 이 파일을 고치고 연결부 점검을 다시 돌린다.
import os from "node:os";
import path from "node:path";

export const PINS = Object.freeze({
  codexPlugin: { key: "codex@openai-codex", version: "1.0.4", sha: "807e03a" },
  claudeSuperpowers: { key: "superpowers@claude-plugins-official", version: "6.4.1", sha: "5bf4e78" },
  codexSuperpowers: { name: "superpowers", version: "6.4.1" }
});

export const EXIT = Object.freeze({ OK: 0, STOPPED: 2, FAILED: 3, LIMIT: 4, ENVIRONMENT: 5 });

export const DEFAULT_TIMEOUT_MIN = 30;
export const USAGE_FILE = "codex-calls.jsonl";
export const ROLES = Object.freeze(["plan", "plan-fix", "implement", "fix", "final-fix", "check"]);
export const EFFORTS = Object.freeze(["none", "minimal", "low", "medium", "high", "xhigh"]);

export function defaultPaths(home = os.homedir()) {
  const cache = path.join(home, ".claude", "plugins", "cache");
  return {
    installedPlugins: path.join(home, ".claude", "plugins", "installed_plugins.json"),
    codexLib: path.join(cache, "openai-codex", "codex", PINS.codexPlugin.version, "scripts", "lib", "codex.mjs"),
    superpowersRoot: path.join(cache, "claude-plugins-official", "superpowers", PINS.claudeSuperpowers.version),
    codexConfig: path.join(home, ".codex", "config.toml"),
    codexSessions: path.join(home, ".codex", "sessions")
  };
}
```

- [ ] **Step 3: 보고 해석 테스트를 쓴다**

`plugin/scripts/test/report.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseReport, buildFormatCorrection, buildMismatchCorrection, REPORT_FIELDS } from "../lib/report.mjs";

const report = (lines) => lines.join("\n");

test("정상 DONE 보고를 해석한다", () => {
  const parsed = parseReport(report([
    "작업을 마쳤습니다.",
    "STATUS: DONE",
    "CHANGED_FILES: greet.py, tests/test_greet.py",
    "COMMIT_MESSAGE: feat: 작별 인사 추가",
    "TESTS: python -m unittest — OK",
    "CONCERNS: none"
  ]));
  assert.deepEqual(parsed, {
    ok: true,
    status: "DONE",
    changedFiles: ["greet.py", "tests/test_greet.py"],
    commitMessage: "feat: 작별 인사 추가",
    tests: "python -m unittest — OK",
    concerns: null
  });
});

test("마크다운으로 꾸민 보고 줄도 해석한다", () => {
  const parsed = parseReport(report([
    "**STATUS:** `DONE_WITH_CONCERNS`",
    "- CHANGED_FILES: greet.py",
    "**COMMIT_MESSAGE**: feat: 시험",
    "TESTS: none",
    "CONCERNS: 경계값 테스트가 부족합니다"
  ]));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, "DONE_WITH_CONCERNS");
  assert.deepEqual(parsed.changedFiles, ["greet.py"]);
  assert.equal(parsed.commitMessage, "feat: 시험");
  assert.equal(parsed.concerns, "경계값 테스트가 부족합니다");
});

test("Windows 경로, ./ 접두어, 백틱, 중복을 정리한다", () => {
  const parsed = parseReport(report([
    "STATUS: DONE",
    "CHANGED_FILES: `tests\\test_greet.py`, ./greet.py, greet.py",
    "COMMIT_MESSAGE: feat: 시험",
    "TESTS: none",
    "CONCERNS: none"
  ]));
  assert.deepEqual(parsed.changedFiles, ["tests/test_greet.py", "greet.py"]);
});

test("none은 빈 목록과 null로 바꾼다", () => {
  const parsed = parseReport(report([
    "STATUS: DONE",
    "CHANGED_FILES: none",
    "COMMIT_MESSAGE: none",
    "TESTS: none",
    "CONCERNS: None"
  ]));
  assert.deepEqual(parsed.changedFiles, []);
  assert.equal(parsed.commitMessage, null);
  assert.equal(parsed.concerns, null);
});

test("같은 줄이 두 번 나오면 마지막 값을 쓴다", () => {
  const parsed = parseReport(report([
    "STATUS: BLOCKED",
    "STATUS: DONE",
    "CHANGED_FILES: none",
    "COMMIT_MESSAGE: none",
    "TESTS: none",
    "CONCERNS: none"
  ]));
  assert.equal(parsed.status, "DONE");
});

test("NEEDS_CONTEXT 보고의 CONCERNS를 남긴다", () => {
  const parsed = parseReport(report([
    "STATUS: NEEDS_CONTEXT",
    "CHANGED_FILES: none",
    "COMMIT_MESSAGE: none",
    "TESTS: none",
    "CONCERNS: 명세에 경계값이 없습니다"
  ]));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, "NEEDS_CONTEXT");
  assert.equal(parsed.concerns, "명세에 경계값이 없습니다");
});

test("STATUS 줄이 없으면 형식 위반이다", () => {
  const parsed = parseReport("다 했습니다.\nCHANGED_FILES: none\nCOMMIT_MESSAGE: none\nTESTS: none\nCONCERNS: none");
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /STATUS/);
});

test("알 수 없는 STATUS 값은 형식 위반이다", () => {
  const parsed = parseReport("STATUS: FINISHED\nCHANGED_FILES: none\nCOMMIT_MESSAGE: none\nTESTS: none\nCONCERNS: none");
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /FINISHED/);
});

test("빈 메시지는 형식 위반이다", () => {
  assert.equal(parseReport("").ok, false);
  assert.equal(parseReport(null).ok, false);
});

test("변경 파일이 있는데 COMMIT_MESSAGE가 none이면 형식 위반이다", () => {
  const parsed = parseReport("STATUS: DONE\nCHANGED_FILES: greet.py\nCOMMIT_MESSAGE: none\nTESTS: none\nCONCERNS: none");
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /COMMIT_MESSAGE/);
});

test("정정 요청 문구에 문제와 다섯 보고 줄이 들어간다", () => {
  const text = buildFormatCorrection("보고 줄이 없습니다: STATUS");
  assert.match(text, /보고 줄이 없습니다: STATUS/);
  for (const field of REPORT_FIELDS) assert.match(text, new RegExp(`^${field}: `, "m"));
});

test("불일치 정정 요청 문구에 양쪽 목록이 들어간다", () => {
  const text = buildMismatchCorrection({ missing: ["a.py"], extra: ["tests/b.py"] });
  assert.match(text, /Reported but not changed: a\.py/);
  assert.match(text, /Changed but not reported: tests\/b\.py/);
  assert.match(text, /^STATUS: /m);
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: FAIL, `Cannot find module` (`report.mjs`가 없음)

- [ ] **Step 5: 보고 해석 모듈을 만든다**

`plugin/scripts/lib/report.mjs`:

```js
// Codex 최종 메시지 끝의 보고 다섯 줄을 해석하고, 형식 위반 때 보낼 정정 요청 문구를 만든다.
export const STATUSES = Object.freeze(["DONE", "DONE_WITH_CONCERNS", "NEEDS_CONTEXT", "BLOCKED"]);
export const REPORT_FIELDS = Object.freeze(["STATUS", "CHANGED_FILES", "COMMIT_MESSAGE", "TESTS", "CONCERNS"]);

export const REPORT_TEMPLATE = [
  "STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>",
  "CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>",
  "COMMIT_MESSAGE: <one-line commit message, or none>",
  "TESTS: <commands you ran and their final result lines, or none>",
  "CONCERNS: <text, or none>"
].join("\n");

const LINE = /^\s*(?:[-*>]\s+)?[*_`]*(STATUS|CHANGED_FILES|COMMIT_MESSAGE|TESTS|CONCERNS)[*_`]*\s*:\s*[*_`]*\s*(.*?)\s*$/;

export function isDone(status) {
  return status === "DONE" || status === "DONE_WITH_CONCERNS";
}

export function normalizePath(value) {
  return value
    .trim()
    .replace(/^[`"']+|[`"']+$/g, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}

export function parseReport(message) {
  if (typeof message !== "string" || message.trim() === "") {
    return { ok: false, error: "Codex 최종 메시지가 비어 있습니다" };
  }
  const values = {};
  for (const line of message.split(/\r?\n/)) {
    const match = LINE.exec(line);
    if (match) values[match[1]] = match[2];
  }
  const missing = REPORT_FIELDS.filter((field) => !(field in values));
  if (missing.length > 0) return { ok: false, error: `보고 줄이 없습니다: ${missing.join(", ")}` };

  const status = values.STATUS.replace(/[`*]/g, "").trim();
  if (!STATUSES.includes(status)) return { ok: false, error: `STATUS 값을 해석할 수 없습니다: ${values.STATUS}` };

  const changedFiles = parseFileList(values.CHANGED_FILES);
  const commitMessage = isNone(values.COMMIT_MESSAGE) ? null : values.COMMIT_MESSAGE.trim();
  if (isDone(status) && changedFiles.length > 0 && commitMessage === null) {
    return { ok: false, error: "CHANGED_FILES가 있는데 COMMIT_MESSAGE가 none입니다" };
  }
  return {
    ok: true,
    status,
    changedFiles,
    commitMessage,
    tests: values.TESTS.trim(),
    concerns: isNone(values.CONCERNS) ? null : values.CONCERNS.trim()
  };
}

export function buildFormatCorrection(error) {
  return [
    "Your final message could not be parsed by the workflow wrapper.",
    `Problem: ${error}`,
    "Do not change any files. Reply again, ending your message with exactly these five lines and the values you intended:",
    REPORT_TEMPLATE
  ].join("\n");
}

export function buildMismatchCorrection({ missing, extra }) {
  return [
    "CHANGED_FILES does not match the uncommitted changes in the repository.",
    `Reported but not changed: ${missing.length > 0 ? missing.join(", ") : "none"}`,
    `Changed but not reported: ${extra.length > 0 ? extra.join(", ") : "none"}`,
    "CHANGED_FILES must list every file changed since the last commit, as repository-relative paths.",
    "If a changed file is a stray artifact, delete it or add an ignore rule and report that change; otherwise add it to CHANGED_FILES.",
    "Then end your message with exactly these five lines:",
    REPORT_TEMPLATE
  ].join("\n");
}

function isNone(value) {
  const text = value.replace(/[`*]/g, "").trim().toLowerCase();
  return text === "" || text === "none";
}

function parseFileList(value) {
  if (isNone(value)) return [];
  return [...new Set(value.split(",").map(normalizePath).filter(Boolean))];
}
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: PASS, `# pass 12`, `# fail 0`

- [ ] **Step 7: 플러그인 정보 파일을 검증한다**

Run: `claude plugin validate ./plugin`
Expected: 마지막 줄 `✔ Validation passed` (경고가 나오면 내용을 보고서에 적는다)

- [ ] **Step 8: 커밋**

```bash
git add plugin/.claude-plugin plugin/.gitignore plugin/scripts/lib/pins.mjs plugin/scripts/lib/report.mjs plugin/scripts/test/report.test.mjs
git commit -m "feat(plugin): add llm-workflow plugin skeleton and Codex report parser"
```

### Task 2: 환경 점검

**Files:**
- Create: `plugin/scripts/lib/environment.mjs`
- Test: `plugin/scripts/test/environment.test.mjs`

**Interfaces:**
- Consumes: `PINS` (`pins.mjs`)
- Produces: `checkInstalledPlugins(jsonText, pins?) -> string[]`, `checkCodexPluginList(listText, pin?) -> string[]`, `checkSandboxConfig(files: {path, text|null}[]) -> string[]`, `collectEnvironmentProblems({ repoDir, paths, readText, fileExists, codexPluginList }) -> string[]` (문제가 없으면 빈 배열)

- [ ] **Step 1: 환경 점검 테스트를 쓴다**

`plugin/scripts/test/environment.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  checkInstalledPlugins,
  checkCodexPluginList,
  checkSandboxConfig,
  collectEnvironmentProblems
} from "../lib/environment.mjs";

const installed = (plugins = {}) => JSON.stringify({
  version: 2,
  plugins: {
    "codex@openai-codex": [{ scope: "user", version: "1.0.4", gitCommitSha: "807e03ac9d5aa23bc395fdec8c3767500a86b3cf" }],
    "superpowers@claude-plugins-official": [{ scope: "user", version: "6.4.1", gitCommitSha: "5bf4e78011075bcfc0dc295f0724994cd123ee71" }],
    ...plugins
  }
});

const pluginList = (...rows) => [
  "Marketplace `openai-codex`",
  "C:\\Users\\x\\.codex\\.tmp\\marketplaces\\openai-codex\\.claude-plugin\\marketplace.json",
  "",
  "PLUGIN              STATUS              VERSION  SOURCE",
  "codex@openai-codex  installed, enabled  1.0.6    C:\\Users\\x\\codex",
  "",
  "Marketplace `openai-curated-remote`",
  "Remote catalog",
  "",
  "PLUGIN                             STATUS              VERSION  SOURCE",
  ...rows
].join("\n");

const PINNED_ROW = "superpowers@superpowers-dev        installed, enabled  6.4.1    C:\\Users\\x\\superpowers";
const CURATED_ROW = "superpowers@openai-curated-remote  installed, enabled  6.4.2    plugins~Plugin_60aea7";
const CURATED_REMOVED_ROW = "superpowers@openai-curated-remote  not installed       6.4.2    plugins~Plugin_60aea7";

test("고정 버전과 커밋이 맞으면 문제가 없다", () => {
  assert.deepEqual(checkInstalledPlugins(installed()), []);
});

test("Claude Code 쪽 버전이나 커밋이 다르면 문제다", () => {
  const problems = checkInstalledPlugins(installed({
    "superpowers@claude-plugins-official": [{ version: "6.4.2", gitCommitSha: "aaaaaaa" }]
  }));
  assert.equal(problems.length, 2);
  assert.match(problems[0], /6\.4\.2/);
  assert.match(problems[1], /aaaaaaa/);
});

test("설치 기록이 없거나 해석할 수 없으면 문제다", () => {
  const data = JSON.parse(installed());
  delete data.plugins["codex@openai-codex"];
  assert.match(checkInstalledPlugins(JSON.stringify(data))[0], /codex@openai-codex/);
  assert.equal(checkInstalledPlugins("{").length, 1);
});

test("Codex 쪽 Superpowers가 6.4.1 하나만 켜져 있으면 문제가 없다", () => {
  assert.deepEqual(checkCodexPluginList(pluginList(PINNED_ROW, CURATED_REMOVED_ROW)), []);
});

test("Codex 쪽 Superpowers 버전이 다르면 문제다", () => {
  const problems = checkCodexPluginList(pluginList(CURATED_ROW));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /6\.4\.2/);
});

test("Codex 쪽 Superpowers가 두 곳에서 설치되어 있으면 문제다", () => {
  assert.match(checkCodexPluginList(pluginList(PINNED_ROW, CURATED_ROW))[0], /여러 곳/);
});

test("Codex 쪽 Superpowers가 없거나 꺼져 있으면 문제다", () => {
  assert.match(checkCodexPluginList(pluginList(CURATED_REMOVED_ROW))[0], /설치되어 있지 않습니다/);
  const disabled = "superpowers@superpowers-dev        installed, disabled  6.4.1    C:\\Users\\x\\superpowers";
  assert.match(checkCodexPluginList(pluginList(disabled))[0], /켜져 있지 않습니다/);
});

test("지금의 Codex 설정에는 샌드박스 경계 문제가 없다", () => {
  const text = 'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "high"\n[windows]\nsandbox = "unelevated"\n';
  assert.deepEqual(checkSandboxConfig([{ path: "config.toml", text }]), []);
});

test("샌드박스 경계를 넓히는 설정을 찾는다", () => {
  const text = [
    'sandbox_mode = "danger-full-access"',
    "[sandbox_workspace_write]",
    "network_access = true",
    'writable_roots = ["C:\\\\tmp"]',
    "profiles.fast.sandbox_workspace_write.network_access = true"
  ].join("\n");
  const problems = checkSandboxConfig([{ path: "config.toml", text }]);
  assert.equal(problems.length, 4);
  assert.ok(problems.every((p) => p.startsWith("config.toml: ")));
});

test("빈 writable_roots, 주석, 없는 파일은 문제가 아니다", () => {
  const text = "writable_roots = []\n# network_access = true\n";
  assert.deepEqual(checkSandboxConfig([{ path: "a", text }, { path: "b", text: null }]), []);
});

test("여러 줄에 걸친 writable_roots는 문제다", () => {
  assert.equal(checkSandboxConfig([{ path: "a", text: "writable_roots = [\n  'C:/x',\n]" }]).length, 1);
});

test("환경 점검은 라이브러리, 설치 기록, Codex 플러그인 목록, 설정을 모두 본다", () => {
  const paths = { codexLib: "lib.mjs", installedPlugins: "installed.json", codexConfig: "config.toml" };
  const files = { "installed.json": installed(), "config.toml": 'model = "x"\n' };
  const base = {
    repoDir: "repo",
    paths,
    readText: (file) => files[file] ?? null,
    fileExists: () => true,
    codexPluginList: () => pluginList(PINNED_ROW)
  };
  assert.deepEqual(collectEnvironmentProblems(base), []);

  const broken = collectEnvironmentProblems({
    ...base,
    fileExists: () => false,
    codexPluginList: () => {
      throw new Error("codex not found");
    }
  });
  assert.equal(broken.length, 2);
  assert.match(broken[0], /라이브러리/);
  assert.match(broken[1], /codex not found/);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: FAIL, `environment.mjs`를 찾을 수 없다는 오류

- [ ] **Step 3: 환경 점검 모듈을 만든다**

`plugin/scripts/lib/environment.mjs`:

```js
// 래퍼가 Codex를 부르기 전에 고정 버전과 Codex 샌드박스 경계 설정을 확인한다.
import path from "node:path";
import { PINS } from "./pins.mjs";

export function checkInstalledPlugins(jsonText, pins = PINS) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return ["installed_plugins.json을 해석할 수 없습니다"];
  }
  const problems = [];
  for (const pin of [pins.codexPlugin, pins.claudeSuperpowers]) {
    const entry = data?.plugins?.[pin.key]?.[0];
    if (!entry) {
      problems.push(`${pin.key}: 설치 기록이 없습니다`);
      continue;
    }
    if (entry.version !== pin.version) problems.push(`${pin.key}: 버전 ${entry.version} (고정값 ${pin.version})`);
    const sha = String(entry.gitCommitSha ?? "");
    if (!sha.startsWith(pin.sha)) problems.push(`${pin.key}: 커밋 ${sha.slice(0, 7) || "없음"} (고정값 ${pin.sha})`);
  }
  return problems;
}

export function checkCodexPluginList(listText, pin = PINS.codexSuperpowers) {
  const rows = listText
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s{2,}/))
    .filter(([plugin = "", status = ""]) => plugin.startsWith(`${pin.name}@`) && status.startsWith("installed"));
  if (rows.length === 0) return [`Codex 쪽 ${pin.name}가 설치되어 있지 않습니다`];
  if (rows.length > 1) {
    return [`Codex 쪽 ${pin.name}가 여러 곳에서 설치되어 있습니다: ${rows.map(([plugin]) => plugin).join(", ")}`];
  }
  const [plugin, status, version] = rows[0];
  const problems = [];
  if (!/\benabled\b/.test(status)) problems.push(`Codex 쪽 ${plugin}가 켜져 있지 않습니다 (${status})`);
  if (version !== pin.version) problems.push(`Codex 쪽 ${plugin}: 버전 ${version} (고정값 ${pin.version})`);
  return problems;
}

const key = (name) => new RegExp(`^\\s*(?:[\\w."'-]+\\.)?${name}\\s*=`);

const SANDBOX_RULES = [
  {
    test: (line) => key("sandbox_mode").test(line) && /danger-full-access/.test(line),
    message: "전체 접근 모드(danger-full-access)가 설정되어 있습니다"
  },
  {
    test: (line) => key("network_access").test(line) && /=\s*true\b/.test(line),
    message: "네트워크 허용(network_access = true)이 설정되어 있습니다"
  },
  {
    test: (line) => key("writable_roots").test(line) && !/=\s*\[\s*\]/.test(line),
    message: "추가 쓰기 경로(writable_roots)가 설정되어 있습니다"
  }
];

export function checkSandboxConfig(files) {
  const problems = [];
  for (const { path: file, text } of files) {
    if (text === null || text === undefined) continue;
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*#/.test(line)) continue;
      for (const rule of SANDBOX_RULES) {
        if (rule.test(line)) problems.push(`${file}: ${rule.message}`);
      }
    }
  }
  return problems;
}

export function collectEnvironmentProblems({ repoDir, paths, readText, fileExists, codexPluginList }) {
  const problems = [];
  if (!fileExists(paths.codexLib)) problems.push(`Codex 플러그인 라이브러리가 없습니다: ${paths.codexLib}`);

  const installed = readText(paths.installedPlugins);
  if (installed === null) problems.push(`설치 기록 파일이 없습니다: ${paths.installedPlugins}`);
  else problems.push(...checkInstalledPlugins(installed));

  let list = null;
  try {
    list = codexPluginList();
  } catch (error) {
    problems.push(`codex plugin list 실행 실패: ${error.message}`);
  }
  if (list !== null) problems.push(...checkCodexPluginList(list));

  const repoConfig = path.join(repoDir, ".codex", "config.toml");
  problems.push(...checkSandboxConfig([
    { path: paths.codexConfig, text: readText(paths.codexConfig) },
    { path: repoConfig, text: readText(repoConfig) }
  ]));
  return problems;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: PASS, `# pass 24`, `# fail 0` (Task 1의 12개 포함)

- [ ] **Step 5: 커밋**

```bash
git add plugin/scripts/lib/environment.mjs plugin/scripts/test/environment.test.mjs
git commit -m "feat(plugin): add environment check for pinned versions and Codex sandbox config"
```

### Task 3: 변경 파일 비교와 커밋

**Files:**
- Create: `plugin/scripts/lib/git-changes.mjs`
- Test: `plugin/scripts/test/git-changes.test.mjs`

**Interfaces:**
- Consumes: `normalizePath` (`report.mjs`)
- Produces: `parsePorcelainZ(output) -> string[]` (정렬, 중복 없음), `listChangedFiles(repoDir) -> string[]`, `compareChangedFiles(reported, actual) -> { match, missing: string[], extra: string[] }`, `buildCommitMessage(subject, model) -> string`, `commitFiles(repoDir, files, message) -> string` (짧은 커밋 해시)

- [ ] **Step 1: 변경 파일과 커밋 테스트를 쓴다**

`plugin/scripts/test/git-changes.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  parsePorcelainZ,
  listChangedFiles,
  compareChangedFiles,
  buildCommitMessage,
  commitFiles
} from "../lib/git-changes.mjs";

test("수정 파일과 새 파일을 읽는다", () => {
  assert.deepEqual(parsePorcelainZ(" M greet.py\0?? tests/test_greet.py\0"), ["greet.py", "tests/test_greet.py"]);
});

test("이름 바꾸기는 새 경로와 원래 경로를 모두 넣고, 복사는 새 경로만 넣는다", () => {
  assert.deepEqual(parsePorcelainZ("R  new.py\0old.py\0 M a.py\0C  copy.py\0src.py\0"), ["a.py", "copy.py", "new.py", "old.py"]);
});

test("한글과 공백이 든 파일 이름을 그대로 읽는다", () => {
  assert.deepEqual(parsePorcelainZ("?? 한글 파일.txt\0"), ["한글 파일.txt"]);
});

test("보고와 실제 변경을 경로 표기와 무관하게 비교한다", () => {
  assert.deepEqual(compareChangedFiles(["./greet.py", "tests\\test_greet.py"], ["greet.py", "tests/test_greet.py"]), {
    match: true,
    missing: [],
    extra: []
  });
  assert.deepEqual(compareChangedFiles(["greet.py", "gone.py"], ["greet.py", "stray.txt"]), {
    match: false,
    missing: ["gone.py"],
    extra: ["stray.txt"]
  });
});

test("커밋 메시지 끝에 실제 모델명 서명 줄을 붙인다", () => {
  assert.equal(buildCommitMessage("feat: 시험", "gpt-5.6-sol"), "feat: 시험\n\nCo-Authored-By: Codex gpt-5.6-sol <noreply@openai.com>\n");
  assert.equal(buildCommitMessage("feat: 시험", null), "feat: 시험\n\nCo-Authored-By: Codex unknown-model <noreply@openai.com>\n");
});

test("보고된 파일만 커밋하고 나머지 변경은 남긴다", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-workflow-git-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "test");
  git("config", "user.email", "test@example.invalid");
  git("config", "core.autocrlf", "false");
  fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
  git("add", "a.txt");
  git("commit", "-q", "-m", "init");

  fs.writeFileSync(path.join(dir, "a.txt"), "changed\n");
  fs.writeFileSync(path.join(dir, "한글 파일.txt"), "새 파일\n");
  fs.writeFileSync(path.join(dir, "stray.txt"), "x\n");
  assert.deepEqual(listChangedFiles(dir), ["a.txt", "stray.txt", "한글 파일.txt"]);

  const hash = commitFiles(dir, ["a.txt", "한글 파일.txt"], buildCommitMessage("feat: 시험", "gpt-test"));
  assert.match(hash, /^[0-9a-f]{7,}$/);
  assert.deepEqual(listChangedFiles(dir), ["stray.txt"]);
  assert.equal(git("log", "-1", "--format=%B").trim(), "feat: 시험\n\nCo-Authored-By: Codex gpt-test <noreply@openai.com>");
  const shown = git("-c", "core.quotepath=false", "show", "--name-only", "--format=", "HEAD");
  assert.deepEqual(shown.trim().split("\n").sort(), ["a.txt", "한글 파일.txt"]);
});

test("삭제된 파일도 커밋한다", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-workflow-git-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "test");
  git("config", "user.email", "test@example.invalid");
  fs.writeFileSync(path.join(dir, "old.txt"), "x\n");
  git("add", "old.txt");
  git("commit", "-q", "-m", "init");

  fs.rmSync(path.join(dir, "old.txt"));
  assert.deepEqual(listChangedFiles(dir), ["old.txt"]);
  commitFiles(dir, ["old.txt"], buildCommitMessage("chore: 삭제", "gpt-test"));
  assert.deepEqual(listChangedFiles(dir), []);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: FAIL, `git-changes.mjs`를 찾을 수 없다는 오류

- [ ] **Step 3: 변경 파일과 커밋 모듈을 만든다**

`plugin/scripts/lib/git-changes.mjs`:

```js
// 마지막 커밋 이후의 변경 파일을 읽고, Codex가 보고한 파일만 커밋한다.
import { execFileSync } from "node:child_process";
import { normalizePath } from "./report.mjs";

export function parsePorcelainZ(output) {
  const entries = output.split("\0");
  const files = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    files.push(normalizePath(entry.slice(3)));
    if (code.includes("R")) {
      if (entries[i + 1]) files.push(normalizePath(entries[i + 1]));
      i += 1;
    } else if (code.includes("C")) {
      i += 1;
    }
  }
  return [...new Set(files)].sort();
}

function git(repoDir, args, options = {}) {
  return execFileSync("git", ["-C", repoDir, ...args], { encoding: "utf8", ...options });
}

export function listChangedFiles(repoDir) {
  return parsePorcelainZ(git(repoDir, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
}

export function compareChangedFiles(reported, actual) {
  const reportedSet = new Set(reported.map(normalizePath));
  const actualSet = new Set(actual.map(normalizePath));
  const missing = [...reportedSet].filter((file) => !actualSet.has(file)).sort();
  const extra = [...actualSet].filter((file) => !reportedSet.has(file)).sort();
  return { match: missing.length === 0 && extra.length === 0, missing, extra };
}

export function buildCommitMessage(subject, model) {
  return `${subject}\n\nCo-Authored-By: Codex ${model || "unknown-model"} <noreply@openai.com>\n`;
}

export function commitFiles(repoDir, files, message) {
  git(repoDir, ["add", "-A", "--", ...files]);
  git(repoDir, ["commit", "-q", "-F", "-"], { input: message });
  return git(repoDir, ["rev-parse", "--short", "HEAD"]).trim();
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: PASS, `# pass 31`, `# fail 0`

- [ ] **Step 5: 커밋**

```bash
git add plugin/scripts/lib/git-changes.mjs plugin/scripts/test/git-changes.test.mjs
git commit -m "feat(plugin): add changed-file comparison and reported-files commit"
```

### Task 4: 세션 기록 읽기와 사용량 합계

**Files:**
- Create: `plugin/scripts/lib/rollout.mjs`
- Create: `plugin/scripts/lib/usage.mjs`
- Create: `plugin/scripts/codex-usage.mjs`
- Test: `plugin/scripts/test/rollout.test.mjs`
- Test: `plugin/scripts/test/usage.test.mjs`

**Interfaces:**
- Consumes: `USAGE_FILE` (`pins.mjs`)
- Produces:
  - `rollout.mjs`: `findRolloutFile(sessionsDir, threadId) -> string|null`, `summarizeTurn(text, turnId) -> { found, completed, model, effort, tokens, rateLimitsStart, rateLimitsEnd, limitReached, error: {message, info}|null }`, `weeklyPercent(rateLimits) -> number|null`, `isLimitError(error) -> boolean`
  - `usage.mjs`: `sumTokens(list) -> object|null`, `summarizeCalls(text) -> { calls, byRole, failures, corrections, durationSec, tokens, weeklyStart, weeklyEnd }`
  - `codex-usage.mjs`: `node plugin/scripts/codex-usage.mjs <진행 기록 폴더>` → 합계 JSON 출력

`codex-calls.jsonl` 한 줄의 필드(Task 5가 쓴다): `time, action, role, task, round, threadId, exitCode, status, corrections, durationSec, models, tokens, weeklyStart, weeklyEnd`.

- [ ] **Step 1: 세션 기록 테스트를 쓴다**

`plugin/scripts/test/rollout.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findRolloutFile, summarizeTurn, weeklyPercent, isLimitError } from "../lib/rollout.mjs";

const line = (value) => JSON.stringify(value);
const limits = (weekly, reached = null) => ({
  primary: { window_minutes: 300, used_percent: 50 },
  secondary: { window_minutes: 10080, used_percent: weekly },
  rate_limit_reached_type: reached
});

const ROLLOUT = [
  line({ type: "session_meta", payload: { id: "thread-1" } }),
  line({ type: "event_msg", payload: { type: "task_started", turn_id: "turn-1" } }),
  line({ type: "turn_context", payload: { turn_id: "turn-1", model: "gpt-old", effort: "high" } }),
  line({ type: "token_usage_record", payload: { turn_id: "turn-1", turn_token_usage: { total_tokens: 100 } } }),
  line({ type: "event_msg", payload: { type: "token_count", info: {}, rate_limits: limits(10) } }),
  line({ type: "event_msg", payload: { type: "task_complete", turn_id: "turn-1", last_agent_message: "ok" } }),
  line({ type: "event_msg", payload: { type: "task_started", turn_id: "turn-2" } }),
  line({ type: "turn_context", payload: { turn_id: "turn-2", model: "gpt-5.6-sol", effort: "xhigh" } }),
  line({ type: "token_usage_record", payload: { turn_id: "turn-2", turn_token_usage: { input_tokens: 30, total_tokens: 40 } } }),
  line({ type: "event_msg", payload: { type: "token_count", info: {}, rate_limits: limits(11) } }),
  "깨진 줄",
  line({ type: "token_usage_record", payload: { turn_id: "turn-2", turn_token_usage: { input_tokens: 60, total_tokens: 80 } } }),
  line({ type: "event_msg", payload: { type: "token_count", info: {}, rate_limits: limits(12) } }),
  line({ type: "event_msg", payload: { type: "task_complete", turn_id: "turn-2", last_agent_message: "done" } })
].join("\n");

test("여러 차례가 쌓인 기록에서 지정한 차례만 읽는다", () => {
  const summary = summarizeTurn(ROLLOUT, "turn-2");
  assert.equal(summary.found, true);
  assert.equal(summary.completed, true);
  assert.equal(summary.model, "gpt-5.6-sol");
  assert.equal(summary.effort, "xhigh");
  assert.deepEqual(summary.tokens, { input_tokens: 60, total_tokens: 80 });
  assert.equal(weeklyPercent(summary.rateLimitsStart), 11);
  assert.equal(weeklyPercent(summary.rateLimitsEnd), 12);
  assert.equal(summary.limitReached, false);
  assert.equal(summary.error, null);

  const first = summarizeTurn(ROLLOUT, "turn-1");
  assert.equal(first.tokens.total_tokens, 100);
  assert.equal(weeklyPercent(first.rateLimitsEnd), 10);
});

test("없는 차례는 found가 false다", () => {
  const summary = summarizeTurn(ROLLOUT, "turn-9");
  assert.equal(summary.found, false);
  assert.equal(summary.tokens, null);
});

test("차례 안의 한도 도달과 오류를 읽는다", () => {
  const text = [
    line({ type: "event_msg", payload: { type: "task_started", turn_id: "turn-1" } }),
    line({ type: "event_msg", payload: { type: "token_count", info: {}, rate_limits: limits(100, "weekly") } }),
    line({
      type: "event_msg",
      payload: {
        type: "task_complete",
        turn_id: "turn-1",
        last_agent_message: null,
        error: { message: "You've hit your usage limit.", codex_error_info: "usage_limit_exceeded" }
      }
    })
  ].join("\n");
  const summary = summarizeTurn(text, "turn-1");
  assert.equal(summary.limitReached, true);
  assert.deepEqual(summary.error, { message: "You've hit your usage limit.", info: "usage_limit_exceeded" });
  assert.equal(isLimitError(summary.error), true);
});

test("주간 한도 창(10080분)을 primary나 secondary에서 찾는다", () => {
  assert.equal(weeklyPercent({ primary: { window_minutes: 10080, used_percent: 7 } }), 7);
  assert.equal(weeklyPercent({ primary: { window_minutes: 300, used_percent: 7 } }), null);
  assert.equal(weeklyPercent(null), null);
});

test("한도 오류를 알아본다", () => {
  assert.equal(isLimitError({ message: "rate limit exceeded" }), true);
  assert.equal(isLimitError({ message: "x", info: "usage_limit_exceeded" }), true);
  assert.equal(isLimitError({ message: "The 'no-such-model-xyz' model is not supported" }), false);
  assert.equal(isLimitError(null), false);
});

test("대화 ID로 세션 기록 파일을 찾는다", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-workflow-sessions-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const nested = path.join(dir, "2026", "10", "05");
  fs.mkdirSync(nested, { recursive: true });
  const file = path.join(nested, "rollout-2026-10-05T20-02-05-thread-abc.jsonl");
  fs.writeFileSync(file, "");
  assert.equal(findRolloutFile(dir, "thread-abc"), file);
  assert.equal(findRolloutFile(dir, "thread-zzz"), null);
  assert.equal(findRolloutFile(path.join(dir, "없음"), "thread-abc"), null);
});
```

- [ ] **Step 2: 사용량 합계 테스트를 쓴다**

`plugin/scripts/test/usage.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { sumTokens, summarizeCalls } from "../lib/usage.mjs";

test("토큰을 항목별로 더하고, 기록이 없으면 null이다", () => {
  assert.deepEqual(sumTokens([{ input_tokens: 10, total_tokens: 12 }, null, { input_tokens: 5, cached_input_tokens: 4, total_tokens: 6 }]), {
    input_tokens: 15,
    cached_input_tokens: 4,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 18
  });
  assert.equal(sumTokens([null, undefined]), null);
});

test("호출 기록 합계를 낸다", () => {
  const lines = [
    { role: "plan", exitCode: 0, corrections: 0, durationSec: 100, tokens: { total_tokens: 1000 }, weeklyStart: 12, weeklyEnd: 13 },
    "깨진 줄",
    { role: "implement", exitCode: 0, corrections: 1, durationSec: 200, tokens: { total_tokens: 500 }, weeklyStart: 13, weeklyEnd: 15 },
    { role: "implement", exitCode: 3, corrections: 0, durationSec: 5, tokens: null, weeklyStart: null, weeklyEnd: null }
  ].map((value) => (typeof value === "string" ? value : JSON.stringify(value))).join("\n");
  const summary = summarizeCalls(`${lines}\n`);
  assert.equal(summary.calls, 3);
  assert.deepEqual(summary.byRole, { plan: 1, implement: 2 });
  assert.equal(summary.failures, 1);
  assert.equal(summary.corrections, 1);
  assert.equal(summary.durationSec, 305);
  assert.equal(summary.tokens.total_tokens, 1500);
  assert.equal(summary.weeklyStart, 12);
  assert.equal(summary.weeklyEnd, 15);
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: FAIL, `rollout.mjs`와 `usage.mjs`를 찾을 수 없다는 오류

- [ ] **Step 4: 세션 기록 모듈을 만든다**

`plugin/scripts/lib/rollout.mjs`:

```js
// Codex 세션 기록(~/.codex/sessions/**/rollout-*-<대화 ID>.jsonl)에서 한 차례의 모델, 토큰, 한도 사용률, 오류를 읽는다.
import fs from "node:fs";
import path from "node:path";

export function findRolloutFile(sessionsDir, threadId) {
  if (!threadId || !fs.existsSync(sessionsDir)) return null;
  const suffix = `-${threadId}.jsonl`;
  const found = fs.readdirSync(sessionsDir, { recursive: true }).find((name) => String(name).endsWith(suffix));
  return found ? path.join(sessionsDir, String(found)) : null;
}

export function summarizeTurn(text, turnId) {
  const summary = {
    found: false,
    completed: false,
    model: null,
    effort: null,
    tokens: null,
    rateLimitsStart: null,
    rateLimitsEnd: null,
    limitReached: false,
    error: null
  };
  let inTurn = false;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      continue;
    }
    const payload = event.payload ?? {};
    if (event.type === "turn_context" && payload.turn_id === turnId) {
      summary.found = true;
      summary.model = payload.model ?? null;
      summary.effort = payload.effort ?? null;
    } else if (event.type === "token_usage_record" && payload.turn_id === turnId && payload.turn_token_usage) {
      summary.tokens = payload.turn_token_usage;
    } else if (event.type === "event_msg" && payload.type === "task_started" && payload.turn_id === turnId) {
      summary.found = true;
      inTurn = true;
    } else if (event.type === "event_msg" && payload.type === "task_complete" && payload.turn_id === turnId) {
      summary.completed = true;
      inTurn = false;
      if (payload.error) summary.error = { message: String(payload.error.message ?? ""), info: payload.error.codex_error_info ?? null };
    } else if (inTurn && event.type === "event_msg" && payload.type === "token_count" && payload.rate_limits) {
      summary.rateLimitsStart ??= payload.rate_limits;
      summary.rateLimitsEnd = payload.rate_limits;
      if (payload.rate_limits.rate_limit_reached_type) summary.limitReached = true;
    }
  }
  return summary;
}

export function weeklyPercent(rateLimits) {
  if (!rateLimits) return null;
  const weekly = [rateLimits.primary, rateLimits.secondary].find((window) => window?.window_minutes === 10080);
  return weekly ? weekly.used_percent : null;
}

export function isLimitError(error) {
  if (!error) return false;
  return /usage[ _-]?limit|rate[ _-]?limit|quota/i.test(`${error.message ?? ""} ${error.info ?? ""}`);
}
```

- [ ] **Step 5: 사용량 합계 모듈과 출력 스크립트를 만든다**

`plugin/scripts/lib/usage.mjs`:

```js
// 토큰을 더하고, 진행 기록 폴더의 codex-calls.jsonl 합계를 낸다.
const TOKEN_FIELDS = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];

export function sumTokens(list) {
  const present = list.filter(Boolean);
  if (present.length === 0) return null;
  const total = {};
  for (const field of TOKEN_FIELDS) {
    total[field] = present.reduce((sum, tokens) => sum + (Number(tokens[field]) || 0), 0);
  }
  return total;
}

export function summarizeCalls(text) {
  const calls = text
    .split(/\r?\n/)
    .filter((raw) => raw.trim())
    .map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const byRole = {};
  for (const call of calls) {
    const role = call.role ?? "unknown";
    byRole[role] = (byRole[role] ?? 0) + 1;
  }
  return {
    calls: calls.length,
    byRole,
    failures: calls.filter((call) => call.exitCode !== 0).length,
    corrections: calls.reduce((sum, call) => sum + (Number(call.corrections) || 0), 0),
    durationSec: calls.reduce((sum, call) => sum + (Number(call.durationSec) || 0), 0),
    tokens: sumTokens(calls.map((call) => call.tokens)),
    weeklyStart: calls.find((call) => call.weeklyStart !== null && call.weeklyStart !== undefined)?.weeklyStart ?? null,
    weeklyEnd: [...calls].reverse().find((call) => call.weeklyEnd !== null && call.weeklyEnd !== undefined)?.weeklyEnd ?? null
  };
}
```

`plugin/scripts/codex-usage.mjs`:

```js
#!/usr/bin/env node
// 진행 기록 폴더의 codex-calls.jsonl 합계를 출력한다. 사용법: node codex-usage.mjs <진행 기록 폴더>
import fs from "node:fs";
import path from "node:path";
import { USAGE_FILE } from "./lib/pins.mjs";
import { summarizeCalls } from "./lib/usage.mjs";

const dir = process.argv[2];
if (!dir) {
  console.error("사용법: node codex-usage.mjs <진행 기록 폴더>");
  process.exit(3);
}
const file = path.join(dir, USAGE_FILE);
if (!fs.existsSync(file)) {
  console.error(`기록 파일이 없습니다: ${file}`);
  process.exit(3);
}
console.log(JSON.stringify(summarizeCalls(fs.readFileSync(file, "utf8")), null, 2));
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: PASS, `# pass 39`, `# fail 0`

- [ ] **Step 7: 출력 스크립트를 실제로 돌려 본다**

Run: `node plugin/scripts/codex-usage.mjs`
Expected: 종료 코드 3, `사용법: node codex-usage.mjs <진행 기록 폴더>`

- [ ] **Step 8: 커밋**

```bash
git add plugin/scripts/lib/rollout.mjs plugin/scripts/lib/usage.mjs plugin/scripts/codex-usage.mjs plugin/scripts/test/rollout.test.mjs plugin/scripts/test/usage.test.mjs
git commit -m "feat(plugin): read Codex rollout usage and summarize wrapper calls"
```

### Task 5: 래퍼 본체

**Files:**
- Create: `plugin/scripts/lib/cli-args.mjs`
- Create: `plugin/scripts/lib/run.mjs`
- Create: `plugin/scripts/codex-run.mjs`
- Test: `plugin/scripts/test/cli-args.test.mjs`
- Test: `plugin/scripts/test/run.test.mjs`

**Interfaces:**
- Consumes: `EXIT`, `USAGE_FILE`, `DEFAULT_TIMEOUT_MIN`, `ROLES`, `EFFORTS`, `defaultPaths` (`pins.mjs`), `parseReport`, `isDone`, `buildFormatCorrection`, `buildMismatchCorrection` (`report.mjs`), `collectEnvironmentProblems` (`environment.mjs`), `listChangedFiles`, `compareChangedFiles`, `buildCommitMessage`, `commitFiles` (`git-changes.mjs`), `findRolloutFile`, `summarizeTurn`, `weeklyPercent`, `isLimitError` (`rollout.mjs`), `sumTokens` (`usage.mjs`)
- Produces:
  - `cli-args.mjs`: `parseCliArgs(argv, now?) -> { ok: true, options } | { ok: false, error }`. `options`: `action, cwd, effort, model, timeoutMin` (모든 동작), `promptFile, workspace, role, task, round, threadId, out` (`start`, `resume`)
  - `run.mjs`: `runWrapper(options, deps) -> Promise<{ exitCode, result, summaryLine }>`, `formatSummary(result, out) -> string`
  - `deps`: `now()`, `readText(file) -> string|null`, `checkEnvironment(repoDir) -> string[]`, `ensureWorkspace(dir)`, `listChangedFiles(repoDir)`, `commitFiles(repoDir, files, message) -> hash`, `runTurn({ cwd, prompt, resumeThreadId, effort, model, onProgress }) -> Promise<{ status, threadId, turnId, finalMessage, error }>`, `interrupt({ cwd, threadId, turnId })`, `readTurnSummary(threadId, turnId) -> Promise<summary|null>`, `appendLine(file, value)`, `writeJson(file, value)`
  - 명령줄: `node plugin/scripts/codex-run.mjs <check|start|resume> --cwd <저장소> [--prompt-file <파일>] [--workspace <진행 기록 폴더>] [--role <역할>] [--task <N>] [--round <R>] [--thread <대화 ID>] [--effort <강도>] [--model <모델>] [--timeout-min <분>] [--out <결과 파일>]`. 표준 출력은 한 줄 요약(`codex-run exit=... status=... thread=... commit=... corrections=... tokens=... weekly=...%->...% result=... reason=...`).

- [ ] **Step 1: 명령줄 인자 테스트를 쓴다**

`plugin/scripts/test/cli-args.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parseCliArgs } from "../lib/cli-args.mjs";

const repo = path.resolve("repo-x");
const ws = path.join(repo, ".superpowers", "sdd", "plan-a");
const startArgs = ["start", "--cwd", repo, "--prompt-file", path.join(ws, "p.md"), "--workspace", ws, "--role", "implement"];

test("첫 인자가 동작 이름이 아니면 오류다", () => {
  assert.equal(parseCliArgs([]).ok, false);
  assert.equal(parseCliArgs(["run", "--cwd", repo]).ok, false);
});

test("check는 --cwd만 있으면 된다", () => {
  const parsed = parseCliArgs(["check", "--cwd", repo]);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.action, "check");
  assert.equal(parsed.options.cwd, repo);
  assert.equal(parsed.options.timeoutMin, 30);
});

test("--cwd가 없거나 모르는 인자가 있으면 오류다", () => {
  assert.match(parseCliArgs(["check"]).error, /--cwd/);
  assert.equal(parseCliArgs(["check", "--cwd", repo, "--bogus", "1"]).ok, false);
});

test("start에는 지시 파일, 진행 기록 폴더, 역할이 필요하다", () => {
  assert.match(parseCliArgs(["start", "--cwd", repo]).error, /--prompt-file/);
  assert.match(parseCliArgs(["start", "--cwd", repo, "--prompt-file", "p.md", "--workspace", ws]).error, /--role/);
});

test("진행 기록 폴더는 .superpowers/sdd 아래 폴더여야 한다", () => {
  const outside = ["start", "--cwd", repo, "--prompt-file", "p.md", "--workspace", path.join(repo, "tmp"), "--role", "implement"];
  assert.match(parseCliArgs(outside).error, /\.superpowers/);
  const root = ["start", "--cwd", repo, "--prompt-file", "p.md", "--workspace", path.join(repo, ".superpowers", "sdd"), "--role", "implement"];
  assert.equal(parseCliArgs(root).ok, false);
});

test("resume에는 --thread가 필요하다", () => {
  const args = ["resume", ...startArgs.slice(1)];
  assert.match(parseCliArgs(args).error, /--thread/);
  const parsed = parseCliArgs([...args, "--thread", "thread-1", "--round", "2"]);
  assert.equal(parsed.options.threadId, "thread-1");
  assert.equal(parsed.options.round, 2);
});

test("잘못된 역할, 추론 강도, 라운드, 제한 시간은 거부한다", () => {
  assert.match(parseCliArgs([...startArgs.slice(0, -1), "writer"]).error, /--role/);
  assert.match(parseCliArgs([...startArgs, "--effort", "max"]).error, /--effort/);
  assert.match(parseCliArgs([...startArgs, "--round", "-1"]).error, /--round/);
  assert.match(parseCliArgs([...startArgs, "--timeout-min", "0"]).error, /--timeout-min/);
});

test("선택 인자를 받는다", () => {
  const parsed = parseCliArgs([...startArgs, "--task", "3", "--effort", "xhigh", "--model", "gpt-x", "--timeout-min", "45"]);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.task, "3");
  assert.equal(parsed.options.effort, "xhigh");
  assert.equal(parsed.options.model, "gpt-x");
  assert.equal(parsed.options.timeoutMin, 45);
  assert.equal(parsed.options.threadId, null);
});

test("결과 파일 기본 경로는 진행 기록 폴더의 codex-results 아래다", () => {
  const parsed = parseCliArgs([...startArgs, "--task", "3"], Date.UTC(2026, 9, 6, 1, 2, 3));
  assert.equal(parsed.options.out, path.join(ws, "codex-results", "2026-10-06T01-02-03-000Z-implement-t3.json"));
  const explicit = parseCliArgs([...startArgs, "--out", path.join(ws, "r.json")]);
  assert.equal(explicit.options.out, path.join(ws, "r.json"));
});
```

- [ ] **Step 2: 처리 순서 테스트를 쓴다**

`plugin/scripts/test/run.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { runWrapper } from "../lib/run.mjs";
import { EXIT } from "../lib/pins.mjs";

const DONE = (files = "greet.py, tests/test_greet.py", message = "feat: 작별 인사 추가") =>
  `작업을 마쳤습니다.\nSTATUS: DONE\nCHANGED_FILES: ${files}\nCOMMIT_MESSAGE: ${message}\nTESTS: python -m unittest — OK\nCONCERNS: none`;

const SUMMARY = {
  found: true,
  completed: true,
  model: "gpt-test",
  effort: "high",
  tokens: { input_tokens: 10, cached_input_tokens: 5, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 12 },
  rateLimitsStart: { secondary: { window_minutes: 10080, used_percent: 12 } },
  rateLimitsEnd: { secondary: { window_minutes: 10080, used_percent: 13 } },
  limitReached: false,
  error: null
};

function setup({ replies = [DONE()], changed = [[], ["greet.py", "tests/test_greet.py"]], options = {}, deps = {} } = {}) {
  const calls = { runTurn: [], commit: [], interrupt: [], lines: [], json: [] };
  const changedQueue = [...changed];
  let count = 0;
  const base = {
    now: () => 1_000_000,
    readText: () => "지시문",
    checkEnvironment: () => [],
    ensureWorkspace: () => {},
    listChangedFiles: () => (changedQueue.length > 1 ? changedQueue.shift() : changedQueue[0]),
    runTurn: async (request) => {
      calls.runTurn.push(request);
      const reply = replies[Math.min(count, replies.length - 1)];
      count += 1;
      if (reply instanceof Error) throw reply;
      if (typeof reply === "function") return reply(request);
      return { status: 0, threadId: "thread-1", turnId: `turn-${count}`, finalMessage: reply, error: null };
    },
    interrupt: async (request) => {
      calls.interrupt.push(request);
    },
    readTurnSummary: async () => SUMMARY,
    commitFiles: (cwd, files, message) => {
      calls.commit.push({ files, message });
      return "abc1234";
    },
    appendLine: (file, value) => calls.lines.push({ file, value }),
    writeJson: (file, value) => calls.json.push({ file, value }),
    ...deps
  };
  const opts = {
    action: "start",
    cwd: "/repo",
    promptFile: "/repo/.superpowers/sdd/p/prompt.md",
    workspace: "/repo/.superpowers/sdd/p",
    role: "implement",
    task: "1",
    round: null,
    threadId: null,
    effort: null,
    model: null,
    timeoutMin: 30,
    out: "/repo/.superpowers/sdd/p/codex-results/r.json",
    ...options
  };
  return { run: () => runWrapper(opts, base), calls };
}

const STOP_REPORT = "STATUS: NEEDS_CONTEXT\nCHANGED_FILES: none\nCOMMIT_MESSAGE: none\nTESTS: none\nCONCERNS: 명세에 경계값이 없습니다";

test("환경 점검에 문제가 있으면 Codex를 부르지 않고 5", async () => {
  const { run, calls } = setup({ deps: { checkEnvironment: () => ["버전 불일치"] } });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.ENVIRONMENT);
  assert.match(result.reason, /버전 불일치/);
  assert.equal(calls.runTurn.length, 0);
  assert.equal(calls.lines.length, 0);
  assert.equal(calls.json.length, 1);
});

test("check는 환경 점검만 하고 파일을 쓰지 않는다", async () => {
  const { run, calls } = setup({ options: { action: "check" } });
  const { exitCode, summaryLine } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(calls.runTurn.length, 0);
  assert.equal(calls.json.length, 0);
  assert.match(summaryLine, /^codex-run exit=0 /);
});

test("지시 파일을 읽을 수 없으면 3", async () => {
  const { run, calls } = setup({ deps: { readText: () => null } });
  assert.equal((await run()).exitCode, EXIT.FAILED);
  assert.equal(calls.runTurn.length, 0);
});

test("새 대화를 시작하기 전에 커밋되지 않은 변경이 있으면 3", async () => {
  const { run, calls } = setup({ changed: [["stray.txt"]] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /stray\.txt/);
  assert.equal(calls.runTurn.length, 0);
});

test("DONE이고 보고가 실제 변경과 같으면 보고된 파일만 커밋하고 0", async () => {
  const { run, calls } = setup();
  const { exitCode, result, summaryLine } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(calls.runTurn[0].resumeThreadId, null);
  assert.deepEqual(calls.commit[0].files, ["greet.py", "tests/test_greet.py"]);
  assert.equal(calls.commit[0].message, "feat: 작별 인사 추가\n\nCo-Authored-By: Codex gpt-test <noreply@openai.com>\n");
  assert.equal(result.commit, "abc1234");
  assert.equal(result.threadId, "thread-1");
  assert.equal(calls.lines.length, 1);
  assert.ok(calls.lines[0].file.endsWith("codex-calls.jsonl"));
  assert.equal(calls.lines[0].value.tokens.total_tokens, 12);
  assert.equal(calls.lines[0].value.weeklyStart, 12);
  assert.equal(calls.lines[0].value.weeklyEnd, 13);
  assert.equal(calls.json[0].file, "/repo/.superpowers/sdd/p/codex-results/r.json");
  assert.match(summaryLine, /exit=0 status=DONE thread=thread-1 commit=abc1234 corrections=0 tokens=12 weekly=12%->13%/);
});

test("STATUS 줄이 없으면 같은 대화에 한 번 정정을 요청한다", async () => {
  const { run, calls } = setup({ replies: ["다 했습니다.", DONE()] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(result.corrections, 1);
  assert.equal(calls.runTurn[1].resumeThreadId, "thread-1");
  assert.match(calls.runTurn[1].prompt, /could not be parsed/);
});

test("정정 뒤에도 형식 위반이면 커밋하지 않고 3", async () => {
  const { run, calls } = setup({ replies: ["다 했습니다.", "정말 다 했습니다."] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /형식 위반/);
  assert.equal(calls.commit.length, 0);
});

test("보고와 실제 변경이 다르면 한 번 정정을 요청하고, 맞으면 커밋한다", async () => {
  const { run, calls } = setup({ replies: [DONE("greet.py"), DONE()] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(result.corrections, 1);
  assert.match(calls.runTurn[1].prompt, /Changed but not reported: tests\/test_greet\.py/);
  assert.deepEqual(calls.commit[0].files, ["greet.py", "tests/test_greet.py"]);
});

test("정정 뒤에도 보고와 실제 변경이 다르면 커밋하지 않고 3", async () => {
  const { run, calls } = setup({ replies: [DONE("greet.py"), DONE("greet.py")] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /실제에만 있음: tests\/test_greet\.py/);
  assert.equal(calls.commit.length, 0);
});

test("NEEDS_CONTEXT면 커밋하지 않고 2", async () => {
  const { run, calls } = setup({ replies: [STOP_REPORT] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.STOPPED);
  assert.equal(result.report.concerns, "명세에 경계값이 없습니다");
  assert.equal(calls.commit.length, 0);
});

test("변경 없는 DONE은 커밋하지 않고 0", async () => {
  const { run, calls } = setup({ replies: [DONE("none", "none")], changed: [[], []] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(calls.commit.length, 0);
  assert.equal(result.commit, null);
});

test("호출 중 예외면 3, 한도 오류면 4", async () => {
  const failed = setup({ replies: [new Error("connection reset")] });
  const first = await failed.run();
  assert.equal(first.exitCode, EXIT.FAILED);
  assert.match(first.result.reason, /connection reset/);

  const limited = setup({ replies: [new Error("You've hit your usage limit.")] });
  assert.equal((await limited.run()).exitCode, EXIT.LIMIT);
});

test("차례가 실패하고 세션 기록이 한도 도달을 알리면 4", async () => {
  const { run } = setup({
    replies: [() => ({ status: 1, threadId: "thread-1", turnId: "turn-1", finalMessage: "", error: { message: "stream disconnected" } })],
    deps: { readTurnSummary: async () => ({ ...SUMMARY, limitReached: true }) }
  });
  assert.equal((await run()).exitCode, EXIT.LIMIT);
});

test("차례가 정상으로 끝났으면 한도 정보가 도달을 가리켜도 결과를 쓴다", async () => {
  const { run, calls } = setup({ deps: { readTurnSummary: async () => ({ ...SUMMARY, limitReached: true }) } });
  assert.equal((await run()).exitCode, EXIT.OK);
  assert.equal(calls.commit.length, 1);
});

test("제한 시간을 넘기면 Codex 실행을 중단시키고 3", async () => {
  const { run, calls } = setup({
    options: { timeoutMin: 0.001 },
    replies: [
      (request) => {
        request.onProgress({ message: "Turn started", threadId: "thread-1", turnId: "turn-9" });
        return new Promise(() => {});
      }
    ]
  });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /제한 시간/);
  assert.deepEqual(calls.interrupt[0], { cwd: "/repo", threadId: "thread-1", turnId: "turn-9" });
});

test("resume은 지정한 대화로 이어가고, 다른 대화가 돌아오면 3", async () => {
  const { run, calls } = setup({ options: { action: "resume", threadId: "thread-7" } });
  const { exitCode, result } = await run();
  assert.equal(calls.runTurn[0].resumeThreadId, "thread-7");
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /thread-7/);
});

test("세션 기록이 없어도 결과를 남기고 사용량은 비운다", async () => {
  const { run, calls } = setup({ deps: { readTurnSummary: async () => null } });
  const { exitCode } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(calls.lines[0].value.tokens, null);
  assert.match(calls.commit[0].message, /Co-Authored-By: Codex unknown-model/);
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: FAIL, `cli-args.mjs`와 `run.mjs`를 찾을 수 없다는 오류

- [ ] **Step 4: 명령줄 인자 모듈을 만든다**

`plugin/scripts/lib/cli-args.mjs`:

```js
// codex-run.mjs의 명령줄 인자를 해석한다.
import path from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_TIMEOUT_MIN, EFFORTS, ROLES } from "./pins.mjs";

const ACTIONS = ["check", "start", "resume"];

export function parseCliArgs(argv, now = Date.now()) {
  const [action, ...rest] = argv;
  if (!ACTIONS.includes(action)) return fail("첫 인자는 check, start, resume 중 하나여야 합니다");

  let values;
  try {
    ({ values } = parseArgs({
      args: rest,
      strict: true,
      options: {
        cwd: { type: "string" },
        "prompt-file": { type: "string" },
        workspace: { type: "string" },
        role: { type: "string" },
        task: { type: "string" },
        round: { type: "string" },
        thread: { type: "string" },
        effort: { type: "string" },
        model: { type: "string" },
        "timeout-min": { type: "string" },
        out: { type: "string" }
      }
    }));
  } catch (error) {
    return fail(error.message);
  }

  if (!values.cwd) return fail("--cwd가 필요합니다");
  const options = {
    action,
    cwd: path.resolve(values.cwd),
    effort: values.effort ?? null,
    model: values.model ?? null,
    timeoutMin: DEFAULT_TIMEOUT_MIN
  };
  if (options.effort !== null && !EFFORTS.includes(options.effort)) return fail(`--effort 값이 올바르지 않습니다: ${options.effort}`);
  if (values["timeout-min"] !== undefined) {
    const minutes = Number(values["timeout-min"]);
    if (!(minutes > 0)) return fail("--timeout-min은 0보다 큰 수여야 합니다");
    options.timeoutMin = minutes;
  }
  if (action === "check") return { ok: true, options };

  for (const key of ["prompt-file", "workspace", "role"]) {
    if (!values[key]) return fail(`--${key}가 필요합니다`);
  }
  if (!ROLES.includes(values.role)) return fail(`--role 값이 올바르지 않습니다: ${values.role}`);
  if (action === "resume" && !values.thread) return fail("resume에는 --thread가 필요합니다");

  const workspace = path.resolve(values.workspace);
  const sddRoot = path.join(options.cwd, ".superpowers", "sdd");
  if (!isInside(workspace, sddRoot)) return fail(`--workspace는 ${sddRoot} 아래 폴더여야 합니다`);

  const round = values.round === undefined ? null : Number(values.round);
  if (round !== null && !(Number.isInteger(round) && round >= 0)) return fail("--round는 0 이상의 정수여야 합니다");

  Object.assign(options, {
    promptFile: path.resolve(values["prompt-file"]),
    workspace,
    role: values.role,
    task: values.task ?? null,
    round,
    threadId: values.thread ?? null
  });
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const name = `${stamp}-${values.role}${values.task ? `-t${values.task}` : ""}.json`;
  options.out = values.out ? path.resolve(values.out) : path.join(workspace, "codex-results", name);
  return { ok: true, options };
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function fail(error) {
  return { ok: false, error };
}
```

- [ ] **Step 5: 처리 순서 모듈을 만든다**

`plugin/scripts/lib/run.mjs`:

```js
// 래퍼의 처리 순서. Codex 호출, git, 파일 입출력은 deps로 받아 테스트에서 바꿔 끼운다.
import path from "node:path";
import { EXIT, USAGE_FILE } from "./pins.mjs";
import { parseReport, isDone, buildFormatCorrection, buildMismatchCorrection } from "./report.mjs";
import { compareChangedFiles, buildCommitMessage } from "./git-changes.mjs";
import { isLimitError, weeklyPercent } from "./rollout.mjs";
import { sumTokens } from "./usage.mjs";

export async function runWrapper(options, deps) {
  const startedAt = deps.now();
  const state = { threadId: options.threadId ?? null, turns: [], corrections: 0, report: null, commit: null };
  const finish = (exitCode, reason) => finalize(options, deps, state, startedAt, exitCode, reason);

  const problems = deps.checkEnvironment(options.cwd);
  if (problems.length > 0) return finish(EXIT.ENVIRONMENT, problems.join("; "));
  if (options.action === "check") return finish(EXIT.OK, "환경 점검 통과");

  const prompt = deps.readText(options.promptFile);
  if (!prompt) return finish(EXIT.FAILED, `지시 파일을 읽을 수 없습니다: ${options.promptFile}`);
  deps.ensureWorkspace(options.workspace);
  if (options.action === "start") {
    const dirty = deps.listChangedFiles(options.cwd);
    if (dirty.length > 0) return finish(EXIT.FAILED, `새 대화를 시작하기 전에 커밋되지 않은 변경이 있습니다: ${dirty.join(", ")}`);
  }

  const first = await runTurn(prompt, options.action === "resume" ? options.threadId : null);
  if (first.exit !== null) return finish(first.exit, first.reason);
  if (options.action === "resume" && first.threadId !== options.threadId) {
    return finish(EXIT.FAILED, `이어간 대화 ID가 다릅니다: 요청 ${options.threadId}, 응답 ${first.threadId}`);
  }

  let report = parseReport(first.finalMessage);
  if (!report.ok) {
    state.corrections += 1;
    const again = await runTurn(buildFormatCorrection(report.error), state.threadId);
    if (again.exit !== null) return finish(again.exit, again.reason);
    report = parseReport(again.finalMessage);
    if (!report.ok) return finish(EXIT.FAILED, `형식 위반 정정 실패: ${report.error}`);
  }
  state.report = report;
  if (!isDone(report.status)) return finish(EXIT.STOPPED, `Codex 보고: ${report.status}`);

  let comparison = compareChangedFiles(report.changedFiles, deps.listChangedFiles(options.cwd));
  if (!comparison.match) {
    state.corrections += 1;
    const again = await runTurn(buildMismatchCorrection(comparison), state.threadId);
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

  if (report.changedFiles.length > 0) {
    const model = [...state.turns].reverse().find((turn) => turn.model)?.model ?? null;
    state.commit = deps.commitFiles(options.cwd, report.changedFiles, buildCommitMessage(report.commitMessage, model));
  }
  return finish(EXIT.OK, `Codex 보고: ${report.status}`);

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
      await deps.interrupt({ cwd: options.cwd, threadId: ids.threadId, turnId: ids.turnId });
      outcome = { timedOut: true, status: 1, error: { message: `제한 시간 ${options.timeoutMin}분 초과` } };
    }

    const threadId = outcome.threadId ?? ids.threadId ?? null;
    const turnId = outcome.turnId ?? ids.turnId ?? null;
    if (threadId) state.threadId = threadId;
    const summary = threadId && turnId ? await deps.readTurnSummary(threadId, turnId) : null;
    state.turns.push({
      turnId,
      model: summary?.model ?? null,
      tokens: summary?.tokens ?? null,
      weeklyStart: weeklyPercent(summary?.rateLimitsStart),
      weeklyEnd: weeklyPercent(summary?.rateLimitsEnd)
    });

    const failed = Boolean(outcome.timedOut || outcome.thrown || outcome.error) || outcome.status !== 0;
    if (!failed) return { exit: null, threadId, finalMessage: outcome.finalMessage ?? "" };
    const error = outcome.error ?? summary?.error ?? null;
    if (!outcome.timedOut && (summary?.limitReached || isLimitError(outcome.error) || isLimitError(summary?.error))) {
      return { exit: EXIT.LIMIT, reason: `한도 도달: ${error?.message ?? "세션 기록의 한도 정보"}` };
    }
    return { exit: EXIT.FAILED, reason: `Codex 호출 실패: ${error?.message ?? `status ${outcome.status}`}` };
  }
}

function finalize(options, deps, state, startedAt, exitCode, reason) {
  const finishedAt = deps.now();
  const usage = {
    tokens: sumTokens(state.turns.map((turn) => turn.tokens)),
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
    durationSec: Math.round((finishedAt - startedAt) / 1000),
    usage,
    finishedAt: new Date(finishedAt).toISOString()
  };
  if (options.action !== "check") {
    deps.writeJson(options.out, result);
    if (state.turns.length > 0) {
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
        durationSec: result.durationSec,
        models: usage.models,
        tokens: usage.tokens,
        weeklyStart: usage.weeklyStart,
        weeklyEnd: usage.weeklyEnd
      });
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
    `tokens=${result.usage.tokens?.total_tokens ?? "-"}`,
    `weekly=${weekly}`,
    `result=${out ?? "-"}`,
    `reason=${result.reason}`
  ].join(" ");
}
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: PASS, `# pass 65`, `# fail 0`

- [ ] **Step 7: 래퍼 진입점을 만든다**

`plugin/scripts/codex-run.mjs`:

```js
#!/usr/bin/env node
// Codex 플러그인을 부르는 유일한 진입점. 쓰는 법은 plugin/skills/codex-planning/SKILL.md에 있다.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { defaultPaths, EXIT } from "./lib/pins.mjs";
import { parseCliArgs } from "./lib/cli-args.mjs";
import { collectEnvironmentProblems } from "./lib/environment.mjs";
import { listChangedFiles, commitFiles } from "./lib/git-changes.mjs";
import { findRolloutFile, summarizeTurn } from "./lib/rollout.mjs";
import { runWrapper } from "./lib/run.mjs";

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`codex-run: ${parsed.error}`);
  process.exit(EXIT.FAILED);
}
const { options } = parsed;
const paths = defaultPaths();

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

const deps = {
  now: () => Date.now(),
  readText,
  checkEnvironment: (repoDir) =>
    collectEnvironmentProblems({
      repoDir,
      paths,
      readText,
      fileExists: (file) => fs.existsSync(file),
      codexPluginList: () => execSync("codex plugin list", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    }),
  ensureWorkspace: (dir) => {
    fs.mkdirSync(dir, { recursive: true });
    const ignoreFile = path.join(options.cwd, ".superpowers", "sdd", ".gitignore");
    if (!fs.existsSync(ignoreFile)) fs.writeFileSync(ignoreFile, "*\n");
  },
  listChangedFiles,
  commitFiles,
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

- [ ] **Step 8: 실제 환경에서 check를 돌려 본다**

이 시점에는 Codex 쪽 Superpowers가 아직 6.4.2이므로 환경 점검 실패가 맞다.

Run: `node plugin/scripts/codex-run.mjs check --cwd .`
Expected: 종료 코드 5, 출력에 `Codex 쪽 superpowers@openai-curated-remote: 버전 6.4.2 (고정값 6.4.1)`이 들어 있고 그 밖의 문제는 없다. 다른 문제가 나오면 내용을 보고서에 적고 멈춘다.

Run: `node plugin/scripts/codex-run.mjs start --cwd .`
Expected: 종료 코드 3, `codex-run: --prompt-file가 필요합니다`

- [ ] **Step 9: 커밋**

```bash
git add plugin/scripts/lib/cli-args.mjs plugin/scripts/lib/run.mjs plugin/scripts/codex-run.mjs plugin/scripts/test/cli-args.test.mjs plugin/scripts/test/run.test.mjs
git commit -m "feat(plugin): add codex-run wrapper with exit codes, corrections, timeout, and usage log"
```

### Task 6: 계획 작성 스킬과 실행 스킬

**Files:**
- Create: `plugin/skills/codex-planning/SKILL.md`
- Create: `plugin/skills/codex-planning/plan-prompt.md`
- Create: `plugin/skills/codex-planning/fix-prompt.md`
- Create: `plugin/skills/codex-planning/handoff-prompt.md`
- Create: `plugin/skills/codex-planning/plan-review-additions.md`
- Create: `plugin/skills/codex-execution/SKILL.md`
- Create: `plugin/skills/codex-execution/implement-prompt.md`
- Create: `plugin/skills/codex-execution/fix-prompt.md`
- Create: `plugin/skills/codex-execution/handoff-prompt.md`
- Create: `plugin/skills/codex-execution/final-fix-prompt.md`
- Create: `plugin/skills/codex-execution/review-additions.md`
- Test: `plugin/scripts/test/skills.test.mjs`

**Interfaces:**
- Consumes: 래퍼 명령줄과 종료 코드(Task 5), `codex-usage.mjs`(Task 4), `REPORT_FIELDS`(Task 1), `defaultPaths().superpowersRoot`(Task 1)
- Produces: 스킬 `llm-workflow:codex-planning`, `llm-workflow:codex-execution`

- [ ] **Step 1: 스킬 구조 테스트를 쓴다**

`plugin/scripts/test/skills.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultPaths } from "../lib/pins.mjs";
import { REPORT_FIELDS } from "../lib/report.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const skillsDir = path.join(pluginRoot, "skills");
const read = (...parts) => fs.readFileSync(path.join(skillsDir, ...parts), "utf8");

const SKILLS = {
  "codex-planning": ["plan-prompt.md", "fix-prompt.md", "handoff-prompt.md", "plan-review-additions.md"],
  "codex-execution": ["implement-prompt.md", "fix-prompt.md", "handoff-prompt.md", "final-fix-prompt.md", "review-additions.md"]
};

const CODEX_PROMPTS = {
  "codex-planning": ["plan-prompt.md", "fix-prompt.md", "handoff-prompt.md"],
  "codex-execution": ["implement-prompt.md", "fix-prompt.md", "handoff-prompt.md", "final-fix-prompt.md"]
};

const SUPERPOWERS_FILES = [
  "skills/subagent-driven-development/scripts/sdd-workspace",
  "skills/subagent-driven-development/scripts/task-brief",
  "skills/subagent-driven-development/scripts/review-package",
  "skills/subagent-driven-development/task-reviewer-prompt.md",
  "skills/subagent-driven-development/re-review-prompt.md",
  "skills/writing-plans/plan-document-reviewer-prompt.md",
  "skills/requesting-code-review/code-reviewer.md"
];

test("스킬마다 이름이 폴더 이름과 같고 설명이 있다", () => {
  for (const name of Object.keys(SKILLS)) {
    const front = /^---\r?\nname: (.+)\r?\ndescription: (.+)\r?\n---/.exec(read(name, "SKILL.md"));
    assert.ok(front, `${name}: frontmatter가 없음`);
    assert.equal(front[1].trim(), name);
    assert.ok(front[2].trim().length > 20, `${name}: 설명이 너무 짧음`);
  }
});

test("스킬이 쓰는 틀 파일이 모두 있고 SKILL.md에 이름이 나온다", () => {
  for (const [name, files] of Object.entries(SKILLS)) {
    const skill = read(name, "SKILL.md");
    for (const file of files) {
      assert.ok(fs.existsSync(path.join(skillsDir, name, file)), `${name}/${file}가 없음`);
      assert.ok(skill.includes(file), `${name}/SKILL.md가 ${file}를 언급하지 않음`);
    }
  }
});

test("Codex 지시문 틀은 다섯 보고 줄과 커밋 금지 규칙을 담는다", () => {
  for (const [name, files] of Object.entries(CODEX_PROMPTS)) {
    for (const file of files) {
      const text = read(name, file);
      for (const field of REPORT_FIELDS) assert.match(text, new RegExp(`^${field}: `, "m"), `${name}/${file}: ${field} 줄이 없음`);
      assert.match(text, /Do not commit/, `${name}/${file}: 커밋 금지 규칙이 없음`);
    }
  }
});

test("틀의 자리표시자는 모두 SKILL.md의 자리표시자 표에 있다", () => {
  for (const [name, files] of Object.entries(SKILLS)) {
    const skill = read(name, "SKILL.md");
    for (const file of files) {
      for (const [, key] of read(name, file).matchAll(/\{\{([A-Z_]+)\}\}/g)) {
        assert.ok(skill.includes(`{{${key}}}`), `${name}/${file}: {{${key}}}가 SKILL.md에 없음`);
      }
    }
  }
});

test("고정된 Superpowers 6.4.1에 스킬이 참조하는 파일이 모두 있다", () => {
  const root = defaultPaths().superpowersRoot;
  for (const file of SUPERPOWERS_FILES) assert.ok(fs.existsSync(path.join(root, file)), `${file}가 없음`);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: FAIL, `skills.test.mjs`의 앞 네 테스트가 `ENOENT`로 실패 (다섯 번째는 통과)

- [ ] **Step 3: 계획 작성 스킬을 만든다**

`plugin/skills/codex-planning/SKILL.md`:

````markdown
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
3. 4~5라운드: `plan-attempts.md`에 지금까지의 수정 시도를 요약하고, `handoff-prompt.md`를 채워 새 대화로 시작한다(`start --role plan-fix --round <N> --effort xhigh`). 5라운드는 4라운드의 새 대화를 이어간다(`resume ... --effort xhigh`).
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
````

`plugin/skills/codex-planning/plan-prompt.md`:

```
You are writing an implementation plan in the git repository at the current working directory. The spec is approved. Do not brainstorm, do not write or change a spec, do not ask design questions, and do not start implementing.

## Inputs
- Approved spec: {{SPEC_PATH}}
- Write the plan to: {{PLAN_PATH}}

## How to write the plan
1. Use your superpowers:writing-plans skill and follow it, with these overrides:
   - The header line "For agentic workers" must read: REQUIRED SUB-SKILL: Use llm-workflow:codex-execution to implement this plan task-by-task. Do not name superpowers:subagent-driven-development or superpowers:executing-plans anywhere in the plan.
   - Skip the skill's "Execution Handoff" section. Do not ask which execution approach to use.
   - Keep each task's commit step and its commit message, but write it as "Report this commit message; the workflow wrapper commits." Implementers never run git commit.
2. Write the plan's prose in Korean. Keep code, commands, file paths, and identifiers as they are.
3. Run the skill's self-review on the finished plan and fix what it finds.
4. Change no file other than {{PLAN_PATH}}. Do not commit; the workflow wrapper commits the file you report.

If the spec leaves a decision you cannot make, stop and report NEEDS_CONTEXT with the question in CONCERNS.

## Final message
End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message such as "docs: <topic> 구현 계획 추가", or none>
TESTS: none
CONCERNS: <text, or none>
```

`plugin/skills/codex-planning/fix-prompt.md`:

```
A reviewer compared your plan {{PLAN_PATH}} with the approved spec {{SPEC_PATH}} and found the issues listed in {{FINDINGS_PATH}}.

Fix every issue in {{PLAN_PATH}}. Do not change any other file, do not brainstorm, and do not ask design questions. If you believe an issue is wrong, leave that part unchanged and explain why in CONCERNS. Do not commit; the workflow wrapper commits the file you report.

End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message such as "docs: 구현 계획 검수 지적 반영", or none>
TESTS: none
CONCERNS: <text, or none>
```

`plugin/skills/codex-planning/handoff-prompt.md`:

```
You are taking over the implementation plan {{PLAN_PATH}} for the approved spec {{SPEC_PATH}}. Review findings on this plan stayed open after {{ROUNDS_SO_FAR}} fix rounds by a previous session. You own the plan now.

Read these first:
- The current plan: {{PLAN_PATH}}
- Every review finding so far, by round: {{FINDINGS_HISTORY_PATH}}
- What the previous session already tried: {{ATTEMPTS_PATH}}

Then fix the findings that are still open (the last round in the findings file). Change only {{PLAN_PATH}}. Do not brainstorm and do not ask design questions. If you believe a finding is wrong, leave that part unchanged and explain why in CONCERNS. Do not commit; the workflow wrapper commits the file you report.

End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message such as "docs: 구현 계획 검수 지적 반영", or none>
TESTS: none
CONCERNS: <text, or none>
```

`plugin/skills/codex-planning/plan-review-additions.md`:

```
## Additional checks for this workflow

Report each of these explicitly, in addition to the categories above:

1. Spec coverage: list every requirement and success criterion in the spec and the task that implements it. A requirement with no task is an issue.
2. Exclusions: nothing the spec lists as out of scope may be implemented by any task. A task that does is an issue.
3. Task size: each task should be one reviewable unit with its own test cycle. Flag tasks too large to review in one pass or too small to carry their own tests.
4. Execution header: the plan header must name llm-workflow:codex-execution. Naming superpowers:subagent-driven-development or superpowers:executing-plans is an issue.
5. Commit steps: no step may tell the implementer to run git commit. Commit steps give the message to report.

You are read-only. Do not edit the plan or any other file.
```

- [ ] **Step 4: 실행 스킬을 만든다**

`plugin/skills/codex-execution/SKILL.md`:

````markdown
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
- BLOCKED: 원인을 보고 한 가지를 바꾼다. 맥락 문제면 맥락을 보태 이어간다. 추론이 부족하면 같은 작업 지시와 보고 파일로 새 대화를 `--effort xhigh`로 시작한다. 작업이 너무 크면 쪼갠 범위를 판정으로 기록하고 차례로 맡긴다. 계획 결함이면 판정을 기록하고 그 판정을 담아 다시 맡긴다.
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
````

`plugin/skills/codex-execution/implement-prompt.md`:

```
You are implementing Task {{TASK_NUMBER}}: {{TASK_NAME}} in the git repository at the current working directory.

## Task
Read your task brief first: {{BRIEF_PATH}}
It is your requirements, with the exact values to use verbatim. The approved spec is {{SPEC_PATH}} and the plan is {{PLAN_PATH}}; read them only for context the brief refers to.

## Context from the controller
{{CONTEXT}}

## Rules
- The design and the plan are approved. Do not brainstorm, do not write a new spec or plan, and do not ask design questions.
- Implement exactly what the brief specifies. Follow test-driven development: write the failing test, run it and see it fail, implement, run it and see it pass.
- While iterating, run the focused tests. Run the full test suite once before you report.
- Do not commit and do not run any git command that writes to the repository. The workflow wrapper commits the files you report. If the brief has a commit step, do not run it; use its commit message as COMMIT_MESSAGE.
- Work only inside this repository. Do not use the network.
- If something is unclear or you are stuck, stop and report NEEDS_CONTEXT or BLOCKED with the specifics in CONCERNS. Do not guess.
- If a file grows beyond the plan's intent, or the work needs restructuring the plan did not anticipate, finish what you can and report DONE_WITH_CONCERNS.

## Self-review before reporting
Check completeness (every requirement in the brief), quality (clear names, clean code), discipline (only what was asked, existing patterns followed), and testing (tests verify real behavior, test-driven development followed, clean output). Fix what you find.

## Report file
Write your full report to {{REPORT_PATH}}:
- What you implemented (or attempted, if blocked)
- Tests you ran and their results
- TDD evidence: RED (command, failing output, why it was expected) and GREEN (command, passing output)
- Files changed
- Self-review findings
- Concerns

The report file is in an ignored folder; do not list it in CHANGED_FILES.

## Final message
End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message, or none>
TESTS: <full-suite command and its final result line, or none>
CONCERNS: <text, or none>
```

`plugin/skills/codex-execution/fix-prompt.md`:

```
A reviewer checked your work on Task {{TASK_NUMBER}}: {{TASK_NAME}} and found the issues listed in {{FINDINGS_PATH}}.

Fix every issue. Do not change anything the findings do not require. If you believe a finding is wrong, leave that code unchanged and explain why in CONCERNS.
Re-run the tests that cover the amended code, then the full test suite once.
Append a fix report to {{REPORT_PATH}}: what you changed, the covering tests, the commands, and their output.

Same rules as before: do not brainstorm or ask design questions, work only inside this repository, and do not use the network. Do not commit and do not run any git command that writes to the repository; the workflow wrapper commits the files you report. Do not list the report file in CHANGED_FILES.

End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message such as "fix: <what you fixed>", or none>
TESTS: <full-suite command and its final result line, or none>
CONCERNS: <text, or none>
```

`plugin/skills/codex-execution/handoff-prompt.md`:

```
You are taking over Task {{TASK_NUMBER}}: {{TASK_NAME}}. Review findings on this task stayed open after {{ROUNDS_SO_FAR}} fix rounds by a previous implementer. You own the task now.

Read these first:
- Task brief (your requirements): {{BRIEF_PATH}}
- The previous implementer's report and fix reports: {{REPORT_PATH}}
- Every review finding so far, by round: {{FINDINGS_HISTORY_PATH}}
- The current code changes for this task: {{DIFF_PATH}}

Fix the findings that are still open (the last round in the findings file). Follow test-driven development where a finding is about behavior. Re-run the covering tests, then the full test suite once. Append your fix report to {{REPORT_PATH}} under the heading "Handoff fix".

Do not brainstorm or ask design questions, work only inside this repository, and do not use the network. If you believe a finding is wrong, leave that code unchanged and explain why in CONCERNS. Do not commit and do not run any git command that writes to the repository. Do not list the report file in CHANGED_FILES.

End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message such as "fix: <what you fixed>", or none>
TESTS: <full-suite command and its final result line, or none>
CONCERNS: <text, or none>
```

`plugin/skills/codex-execution/final-fix-prompt.md`:

```
The final review of this whole branch found the issues listed in {{FINDINGS_PATH}}. Fix all of them in this one pass.

Context: the approved spec {{SPEC_PATH}}, the plan {{PLAN_PATH}}, and the branch's changes {{DIFF_PATH}}.
For each finding about behavior, add or update a test that fails before your fix and passes after it. Run the full test suite once at the end.
Write your report to {{REPORT_PATH}}: each finding, what you changed, the tests, the commands, and their output. If you believe a finding is wrong, leave that code unchanged and explain why in CONCERNS.

Do not brainstorm or ask design questions, work only inside this repository, and do not use the network. Do not commit and do not run any git command that writes to the repository. Do not list the report file in CHANGED_FILES.

End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message such as "fix: 최종 검수 지적 반영", or none>
TESTS: <full-suite command and its final result line, or none>
CONCERNS: <text, or none>
```

`plugin/skills/codex-execution/review-additions.md`:

```
## Implementer concerns

The implementer reported these concerns in its final message: {{CONCERNS}}
Its report file may list more under a Concerns heading.

For each concern, give a verdict with one line of evidence from the code or tests:
- VALID: a real problem in this task. Also list it under Issues with a severity.
- REJECTED: not a problem. Say why.
- DEFERRED: real, but it belongs outside this task. Say where it belongs.

If there are no concerns, write "Implementer concerns: none".
You are read-only. Do not edit any file.
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: PASS, `# pass 70`, `# fail 0`

- [ ] **Step 6: 플러그인을 다시 검증한다**

Run: `claude plugin validate ./plugin`
Expected: 마지막 줄 `✔ Validation passed`

- [ ] **Step 7: 커밋**

```bash
git add plugin/skills plugin/scripts/test/skills.test.mjs
git commit -m "feat(plugin): add codex-planning and codex-execution skills with Codex prompt templates"
```

### Task 7: 연결부 점검 스크립트

**Files:**
- Create: `plugin/scripts/lib/check-eval.mjs`
- Create: `plugin/scripts/codex-check.mjs`
- Test: `plugin/scripts/test/check-eval.test.mjs`

**Interfaces:**
- Consumes: `PINS`, `EXIT`, `USAGE_FILE` (`pins.mjs`), 래퍼 명령줄과 결과 파일 형식 (Task 5)
- Produces: `trailerModel(commitMessage) -> string|null`, `evaluateBoundary(testsLine, { outsideFileExists, gitFileExists }) -> { pass, detail }`, 명령 `node plugin/scripts/codex-check.mjs` (모두 통과하면 종료 코드 0, 아니면 1)

- [ ] **Step 1: 판정 함수 테스트를 쓴다**

`plugin/scripts/test/check-eval.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { trailerModel, evaluateBoundary } from "../lib/check-eval.mjs";

const DENIED = '{"outside_write": "denied", "git_write": "denied", "network": "denied"}';

test("커밋 메시지의 Codex 서명 줄에서 모델명을 읽는다", () => {
  assert.equal(trailerModel("feat: 시험\n\nCo-Authored-By: Codex gpt-5.6-sol <noreply@openai.com>\n"), "gpt-5.6-sol");
  assert.equal(trailerModel("feat: 시험\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n"), null);
  assert.equal(trailerModel(""), null);
});

test("세 경계가 모두 거부되고 파일이 없으면 통과다", () => {
  assert.equal(evaluateBoundary(DENIED, { outsideFileExists: false, gitFileExists: false }).pass, true);
  assert.equal(evaluateBoundary(`python boundary_probe.py -> ${DENIED}`, { outsideFileExists: false, gitFileExists: false }).pass, true);
});

test("하나라도 허용되면 실패다", () => {
  const allowed = '{"outside_write": "allowed", "git_write": "denied", "network": "allowed"}';
  const verdict = evaluateBoundary(allowed, { outsideFileExists: false, gitFileExists: false });
  assert.equal(verdict.pass, false);
  assert.match(verdict.detail, /저장소 밖 쓰기/);
  assert.match(verdict.detail, /네트워크/);
});

test("보고는 거부라도 파일이 실제로 생겼으면 실패다", () => {
  const verdict = evaluateBoundary(DENIED, { outsideFileExists: false, gitFileExists: true });
  assert.equal(verdict.pass, false);
  assert.match(verdict.detail, /\.git/);
});

test("점검 출력을 읽을 수 없으면 실패다", () => {
  assert.equal(evaluateBoundary("none", { outsideFileExists: false, gitFileExists: false }).pass, false);
  assert.equal(evaluateBoundary(undefined, { outsideFileExists: false, gitFileExists: false }).pass, false);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: FAIL, `check-eval.mjs`를 찾을 수 없다는 오류

- [ ] **Step 3: 판정 함수 모듈을 만든다**

`plugin/scripts/lib/check-eval.mjs`:

```js
// 연결부 점검 스크립트의 판정 함수.
export function trailerModel(commitMessage) {
  const match = /^Co-Authored-By: Codex (\S+) <noreply@openai\.com>$/m.exec(commitMessage ?? "");
  return match ? match[1] : null;
}

export function evaluateBoundary(testsLine, { outsideFileExists, gitFileExists }) {
  const text = String(testsLine ?? "");
  let probe = null;
  try {
    probe = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    probe = null;
  }
  if (!probe || typeof probe !== "object") return { pass: false, detail: `점검 출력을 읽을 수 없습니다: ${text || "없음"}` };

  const problems = [];
  if (probe.outside_write !== "denied" || outsideFileExists) problems.push("저장소 밖 쓰기가 허용됨");
  if (probe.git_write !== "denied" || gitFileExists) problems.push(".git 쓰기가 허용됨");
  if (probe.network !== "denied") problems.push("네트워크가 허용됨");
  if (problems.length > 0) return { pass: false, detail: problems.join(", ") };
  return { pass: true, detail: "저장소 밖 쓰기, .git 쓰기, 네트워크가 모두 거부됨" };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: PASS, `# pass 75`, `# fail 0`

- [ ] **Step 5: 연결부 점검 스크립트를 만든다**

이 스크립트는 실제 Codex를 부르므로 단위 테스트가 없다. Task 8에서 실제로 돌려 확인한다.

`plugin/scripts/codex-check.mjs`:

```js
#!/usr/bin/env node
// 연결부 점검: Codex CLI, Codex 플러그인, Superpowers 버전을 바꿀 때마다 실행한다.
// OS 임시 폴더에 작은 저장소를 만들고 래퍼를 통해 Codex를 실제로 부른다. 만든 폴더는 지우지 않는다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PINS, EXIT, USAGE_FILE } from "./lib/pins.mjs";
import { evaluateBoundary, trailerModel } from "./lib/check-eval.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.join(here, "codex-run.mjs");
const outsideDir = path.resolve(here, "..", ".check-outside");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "llm-workflow-check-"));
const repo = path.join(root, "repo");
const workspace = path.join(repo, ".superpowers", "sdd", "check");
const results = [];

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

const boundaryPrompt = (dir) => [
  "This is a sandbox boundary check. Do not change any files in this repository.",
  `Run this command exactly once and wait for it to finish: python boundary_probe.py "${dir}"`,
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
  console.log("");
  for (const item of results) console.log(`[${item.pass ? "통과" : "실패"}] ${item.name} — ${item.detail}`);
  console.log("");
  console.log(`임시 저장소는 지우지 않았습니다: ${root}`);
  process.exit(results.length === 7 && results.every((item) => item.pass) ? 0 : 1);
}

function main() {
  setupRepo();
  printHeader();

  const check = spawnSync(process.execPath, [wrapper, "check", "--cwd", repo], { encoding: "utf8" });
  record("1. 환경 점검", check.status === EXIT.OK, (check.stdout || check.stderr || "").trim());
  if (check.status !== EXIT.OK) return finishAll();

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
  const unittest = spawnSync("python", ["-m", "unittest", "-q"], { cwd: repo, encoding: "utf8" });
  record("3. 한글", subject === "feat: 작별 인사 추가" && unittest.status === 0, `커밋 제목=${subject || "-"} 테스트 종료 코드=${unittest.status}`);

  if (impl.result?.threadId) {
    const resume = callWrapper(
      "resume",
      ["resume", "--role", "check", "--task", "1", "--round", "1", "--thread", impl.result.threadId],
      RESUME_PROMPT
    );
    const answer = String(resume.result?.report?.concerns ?? "").replace(/[`*]/g, "").trim();
    record(
      "4. 대화 이어가기",
      resume.exitCode === EXIT.OK && resume.result?.threadId === impl.result.threadId && answer === "farewell",
      `exit=${resume.exitCode} thread=${resume.result?.threadId ?? "-"} 답=${answer || "-"}`
    );
  } else {
    record("4. 대화 이어가기", false, "2번에서 대화 ID를 얻지 못해 건너뜀");
  }

  const bad = callWrapper("bad-model", ["start", "--role", "check", "--task", "5", "--model", "no-such-model-xyz"], "Reply with OK.");
  record("5. 실패 판별", bad.exitCode === EXIT.FAILED, `exit=${bad.exitCode} ${bad.result?.reason ?? bad.stderr}`);

  const outsideFile = path.join(outsideDir, "probe.txt");
  const gitFile = path.join(repo, ".git", "llm-workflow-probe");
  if (fs.existsSync(outsideFile)) {
    record("6. 샌드박스 경계", false, `이전 실행이 남긴 파일을 먼저 지워 주세요: ${outsideFile}`);
  } else {
    const probe = callWrapper("boundary", ["start", "--role", "check", "--task", "6"], boundaryPrompt(outsideDir));
    const verdict =
      probe.exitCode === EXIT.OK
        ? evaluateBoundary(probe.result?.report?.tests, { outsideFileExists: fs.existsSync(outsideFile), gitFileExists: fs.existsSync(gitFile) })
        : { pass: false, detail: `exit=${probe.exitCode} ${probe.result?.reason ?? probe.stderr}` };
    record("6. 샌드박스 경계", verdict.pass, verdict.detail);
  }

  const usageFile = path.join(workspace, USAGE_FILE);
  const lines = fs.existsSync(usageFile)
    ? fs.readFileSync(usageFile, "utf8").split(/\r?\n/).filter(Boolean).map((raw) => JSON.parse(raw))
    : [];
  const okLines = lines.filter((item) => item.exitCode === EXIT.OK);
  const usageOk = okLines.length > 0 && okLines.every((item) => item.tokens?.total_tokens > 0 && typeof item.weeklyEnd === "number");
  record("7. 사용량 기록", usageOk, `기록 ${lines.length}줄, 성공 호출 ${okLines.length}줄`);

  finishAll();
}

main();
```

- [ ] **Step 6: 스크립트 문법을 확인한다**

Run: `node --check plugin/scripts/codex-check.mjs`
Expected: 출력 없음, 종료 코드 0

- [ ] **Step 7: 커밋**

```bash
git add plugin/scripts/lib/check-eval.mjs plugin/scripts/codex-check.mjs plugin/scripts/test/check-eval.test.mjs
git commit -m "feat(plugin): add Codex connection check script"
```

### Task 8: 설치, 버전 고정, 연결부 점검, 문서 갱신

이 작업은 사용자 범위 설정(`~/.claude`, `~/.codex`)을 바꾸므로 서브에이전트에 맡기지 않는다. 컨트롤러가 사용자와 함께 진행하고, "사용자 승인" 표시가 있는 단계는 승인을 받은 뒤에만 실행한다. 어느 단계든 예상과 다른 결과가 나오면 멈추고 보고한다.

**Files:**
- Modify: `docs/2026-10-05 Codex 연결부 탐색 보고서.md` (끝에 절 추가)
- Modify: `docs/superpowers/specs/2026-10-05-stage3-codex-worker-design.md` (3.6절 표 한 칸)
- Modify: `docs/에이전트 워크플로우 구축 계획 — 빠른 참고.md` (운영 규칙 한 줄)

**Interfaces:**
- Consumes: Task 1~7의 모든 결과물
- Produces: 설치된 플러그인 `llm-workflow@llm-workflow-local`, Codex 쪽 Superpowers 6.4.1, 연결부 점검 결과

- [ ] **Step 1: 전체 테스트와 플러그인 검증**

Run: `node --test "plugin/scripts/test/*.test.mjs"`
Expected: PASS, `# pass 75`, `# fail 0`

Run: `claude plugin validate ./plugin`
Expected: 마지막 줄 `✔ Validation passed`

- [ ] **Step 2: 플러그인 설치 (사용자 승인)**

Run: `claude plugin marketplace add ./plugin`
Expected: `Successfully added marketplace: llm-workflow-local`

Run: `claude plugin install llm-workflow@llm-workflow-local`
Expected: `Successfully installed plugin: llm-workflow@llm-workflow-local (scope: user)`

Run: `claude plugin list`
Expected: `llm-workflow@llm-workflow-local`이 enabled로 나온다

- [ ] **Step 3: Claude Code 쪽 Superpowers 자동 갱신 끄기 (사용자가 직접)**

사용자에게 안내한다: Claude Code 입력창에서 `/plugin`을 열고 **Marketplaces** 탭 → `claude-plugins-official` → **Disable auto-update**를 선택한다. 이 설정은 같은 마켓플레이스의 다른 공식 플러그인에도 적용된다. 사용자가 끝냈다고 확인하면 다음 단계로 간다.

- [ ] **Step 4: Codex 쪽 Superpowers를 6.4.1로 고정 (사용자 승인)**

Run: `codex plugin remove superpowers@openai-curated-remote`
Expected: 제거 성공 메시지

Run: `codex plugin marketplace add obra/superpowers@5bf4e78011075bcfc0dc295f0724994cd123ee71`
Expected: 마켓플레이스 추가 성공 메시지

Run: `codex plugin list`
Expected: 새 마켓플레이스(예상 이름 `superpowers-dev`) 아래에 `superpowers@superpowers-dev  not installed  6.4.1` 줄이 있다. 이름이 다르면 출력에 나온 이름을 다음 명령에 쓴다.

Run: `codex plugin add superpowers@superpowers-dev`
Expected: 설치 성공 메시지

Run: `codex plugin list`
Expected: `installed`로 시작하는 superpowers 줄이 하나뿐이고, `installed, enabled`, 버전 `6.4.1`이다

- [ ] **Step 5: 래퍼 환경 점검**

Run: `node plugin/scripts/codex-run.mjs check --cwd .`
Expected: 종료 코드 0, `codex-run exit=0 ... reason=환경 점검 통과`

- [ ] **Step 6: 연결부 점검 실행**

Codex를 실제로 6번 부르므로 몇 분 걸린다(시간 초과 점검에만 약 3분). Bash 백그라운드 실행으로 돌리고 끝났다는 알림을 기다린다.

Run: `node plugin/scripts/codex-check.mjs`
Expected: 종료 코드 0, 아홉 줄 모두 `[통과]`. 하나라도 `[실패]`면 출력 전체를 사용자에게 보고하고 멈춘다. 테스트나 판정 기준을 고쳐서 통과시키지 않는다. 원인 조사는 superpowers:systematic-debugging으로 한다.

- [ ] **Step 7: 탐색 보고서에 고정 후 점검 결과를 덧붙인다**

`docs/2026-10-05 Codex 연결부 탐색 보고서.md` 끝에 아래 절을 추가한다. `<...>` 자리는 Step 4~6의 실제 출력으로 채운다.

```markdown
## 고정 후 연결부 점검 (<점검 날짜>)

3단계 플러그인(`plugin/`)을 설치하고 버전을 고정한 뒤 `node plugin/scripts/codex-check.mjs`를 돌린 결과다.

- 고정한 버전: Codex 플러그인 1.0.4 (`807e03a`), Superpowers Claude Code 쪽 6.4.1 (`5bf4e78`), Codex 쪽 6.4.1 (마켓플레이스 `<Step 4에서 쓴 이름>`, 커밋 `5bf4e78`)
- Codex CLI: <codex --version 출력>

<codex-check.mjs가 출력한 [통과]/[실패] 아홉 줄을 그대로 붙인다>

- 임시 폴더 쓰기: Codex 기본 정책(`exclude_tmpdir_env_var: false`)상 OS 임시 폴더 쓰기는 허용되는 것으로 보인다. 점검 6번은 임시 폴더가 아닌 `plugin/.check-outside/`로 저장소 밖 쓰기를 확인했다.
```

- [ ] **Step 8: 명세와 설계 문서를 고친다**

`docs/superpowers/specs/2026-10-05-stage3-codex-worker-design.md` 3.6절 표의 쓰기 범위 칸:

변경 전:
```
| 쓰기 범위 | 저장소 폴더만 |
```
변경 후:
```
| 쓰기 범위 | 저장소 폴더만 (Codex 기본 정책상 OS 임시 폴더도 쓰기 허용으로 보임, 탐색 보고서 참고) |
```

`docs/에이전트 워크플로우 구축 계획 — 빠른 참고.md` 운영 규칙의 수정 루프 줄 끝(`이후 남은 문제는 마스터가 판정하고 기록` 바로 뒤)에 다음 문장을 붙인다:

```
 (3단계 시험에서는 Claude Opus를 투입하지 않고 작성과 수정을 끝까지 Codex만 한다. 근거: 3단계 명세 1절)
```

- [ ] **Step 9: 커밋**

```bash
git add "docs/2026-10-05 Codex 연결부 탐색 보고서.md" docs/superpowers/specs/2026-10-05-stage3-codex-worker-design.md "docs/에이전트 워크플로우 구축 계획 — 빠른 참고.md"
git commit -m "docs: record pinned connection check and stage 3 fix-loop rule"
```

이 계획은 명세 7.1절(시험 전)까지다. 7.2절 비교 시험은 이 계획이 끝난 뒤 사용자 승인을 받고 별도로 진행한다.

