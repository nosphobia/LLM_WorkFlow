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

function makeRepo(plan = PLAN) {
  const repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "codex-task-test-")), "repo");
  fs.mkdirSync(path.join(repo, "docs"), { recursive: true });
  fs.writeFileSync(path.join(repo, "docs", "plan.md"), `${plan}\n`);
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

test("계획 머리말의 명세 줄을 읽지 못하거나 명세 파일이 없으면 none으로 넘기지 않고 3", { skip }, () => {
  const korean = makeRepo(PLAN.replace("**Spec:**", "**명세:**"));
  const run = runTask(korean.repo, ["run", "--role", "implement", "--task", "1", "--dry-run"]);
  assert.equal(run.status, 3);
  assert.match(run.stderr, /계획 머리말에 `\*\*Spec:\*\* `/);
  assert.equal(fs.existsSync(path.join(korean.repo, ".superpowers", "sdd")), false);
  const review = runTask(korean.repo, ["review", "--kind", "final", "--base", "HEAD"]);
  assert.equal(review.status, 3);
  assert.match(review.stderr, /\*\*Spec:\*\*/);
  const ledger = runTask(korean.repo, ["ledger", "--text", "멈춤: 명세 줄 없음"]);
  assert.equal(ledger.status, 0);

  const missing = makeRepo(PLAN.replace("docs/spec.md", "docs/gone.md"));
  const gone = runTask(missing.repo, ["run", "--role", "implement", "--task", "1", "--dry-run"]);
  assert.equal(gone.status, 3);
  assert.match(gone.stderr, /명세 파일이 없습니다: docs\/gone\.md/);
});

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

// 가짜 래퍼: --out에 결과 JSON을 쓰고 환경 변수로 정한 코드로 끝난다. Codex를 부르지 않는다.
function makeFake(repo) {
  const fake = path.join(path.dirname(repo), "fake-codex-run.mjs");
  fs.writeFileSync(
    fake,
    [
      'import fs from "node:fs";',
      'const argv = process.argv.slice(2);',
      'const out = argv[argv.indexOf("--out") + 1];',
      'import path from "node:path"; fs.mkdirSync(path.dirname(out), { recursive: true });',
      'const code = Number(process.env.FAKE_EXIT ?? 0);',
      'if (process.env.FAKE_MODE === "badjson") fs.writeFileSync(out, "{not json");',
      'else if (process.env.FAKE_MODE === "null") fs.writeFileSync(out, "null");',
      'else if (process.env.FAKE_MODE !== "nofile") fs.writeFileSync(out, JSON.stringify({',
      '  exitCode: process.env.FAKE_MODE === "mismatch" ? 3 : code,',
      '  status: "DONE", threadId: "thr-1", commit: "abc1234", warnings: ["네트워크 명령 감지 1", "some other warning"],',
      '  networkCommands: [{ command: "curl x" }], riskyCommands: [{ matches: ["rm"], command: "rm -rf y" }],',
      '  subagents: [{ id: "s1" }], usage: { totalTokens: { total_tokens: 1234 }, subagentCount: 1 }',
      "}));",
      'console.log("fake wrapper done");',
      'process.exit(Number(process.env.FAKE_EXIT ?? 0));'
    ].join("\n")
  );
  return fake;
}

function runFake(repo, mode, exit, roleArgs = ["--role", "implement", "--task", "1"]) {
  const fake = makeFake(repo);
  const proc = spawnSync(process.execPath, [script, "run", ...roleArgs, "--cwd", repo, "--plan", "docs/plan.md"], {
    cwd: repo,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, LLM_WORKFLOW_CODEX_RUN_SCRIPT: fake, FAKE_EXIT: String(exit), FAKE_MODE: mode }
  });
  const ledger = fs.readdirSync(path.join(repo, ".superpowers", "sdd"), { recursive: true }).find((name) => String(name).endsWith("progress.md"));
  return { proc, ledger: fs.readFileSync(path.join(repo, ".superpowers", "sdd", String(ledger)), "utf8") };
}

test("run: 가짜 래퍼 성공 시 진행 기록에 기준 줄, 호출 뒤 줄, 경고 줄이 남는다", { skip }, () => {
  const { repo } = makeRepo();
  const { proc, ledger } = runFake(repo, "ok", 0);
  assert.equal(proc.status, 0, proc.stderr);
  assert.match(ledger, /- Task 1: base [0-9a-f]{7}\n/);
  assert.match(ledger, /- Task 1: codex thread thr-1 — exit 0 DONE, commit abc1234, tokens 1234, subagents 1\n/);
  assert.match(ledger, /- 네트워크 경고: curl x\n/);
  assert.match(ledger, /- 위험 명령 경고: rm: rm -rf y\n/);
  assert.match(ledger, /- 하위 에이전트 경고: thr-1 1개\n/);
  assert.match(ledger, /- 래퍼 경고: some other warning\n/);
  assert.doesNotMatch(ledger, /래퍼 경고: 네트워크 명령 감지/);
});

test("run: 래퍼가 3으로 끝나도 호출 뒤 줄을 쓰고 3을 돌려준다", { skip }, () => {
  const { repo } = makeRepo();
  const { proc, ledger } = runFake(repo, "ok", 3);
  assert.equal(proc.status, 3);
  assert.match(ledger, /- Task 1: codex thread thr-1 — exit 3 DONE, commit abc1234/);
});

test("run: 결과 파일이 깨졌거나 없거나 null이거나 종료 코드가 다르면 3이고, 기록과 다음 안내도 실패로 맞춘다", { skip }, () => {
  for (const mode of ["badjson", "nofile", "null", "mismatch"]) {
    const ok = runFake(makeRepo().repo, mode, 0);
    assert.equal(ok.proc.status, 3, mode);
    assert.match(ok.proc.stderr, /래퍼/, mode);
    assert.match(ok.ledger, /— exit 3 /, mode);
    assert.doesNotMatch(ok.ledger, /— exit 0 /, mode);
    assert.match(ok.proc.stdout, /^next: 멈추고 보고한다/m, mode);
    assert.doesNotMatch(ok.proc.stdout, /검수로/, mode);
    assert.equal(runFake(makeRepo().repo, mode, 2).proc.status, 2, mode);
  }
});

test("--round와 --task는 양의 정수여야 한다", { skip }, () => {
  const { repo } = makeRepo();
  assert.match(runTask(repo, ["run", "--role", "implement", "--task", "1x", "--dry-run"]).stderr, /--task/);
  assert.equal(runTask(repo, ["run", "--role", "implement", "--task", "1", "--round", "0", "--dry-run"]).status, 3);
  assert.equal(runTask(repo, ["review", "--kind", "task", "--task", "abc", "--base", "HEAD"]).status, 3);
});

test("--round 0은 fix(우려 처리)에서만 받는다", { skip }, () => {
  const { repo } = makeRepo();
  fs.writeFileSync(path.join(repo, "findings.md"), "- concern\n");
  const fix = ["--role", "fix", "--task", "1", "--round", "0", "--thread", "T", "--findings", "findings.md"];
  const ok = runTask(repo, ["run", ...fix, "--dry-run"]);
  assert.equal(ok.status, 0, ok.stderr);
  const handoff = runTask(repo, ["run", "--role", "handoff", "--task", "1", "--round", "0", "--diff", "findings.md", "--dry-run"]);
  assert.equal(handoff.status, 3);
  assert.match(handoff.stderr, /--round 0/);
});

test("run: 우려 처리(fix round 0)가 끝나면 첫 작업 검수로, round 1 이상이면 재검수로 안내한다", { skip }, () => {
  for (const [round, expected] of [["0", /next: .*review --kind task --task 1/], ["1", /next: .*review --kind rereview --task 1/]]) {
    const { repo } = makeRepo();
    fs.writeFileSync(path.join(repo, "findings.md"), "- concern\n");
    const { proc } = runFake(repo, "ok", 0, ["--role", "fix", "--task", "1", "--round", round, "--thread", "T", "--findings", "findings.md"]);
    assert.equal(proc.status, 0, proc.stderr);
    assert.match(proc.stdout, expected);
  }
});

test("run: 잘못된 --timeout-min은 3으로 끝나고 지시문과 기록을 만들지 않는다", { skip }, () => {
  for (const bad of ["abc", "0", "-1"]) {
    const { repo } = makeRepo();
    const run = runTask(repo, ["run", "--role", "implement", "--task", "1", "--timeout-min", bad]);
    assert.equal(run.status, 3, bad);
    assert.match(run.stderr, /--timeout-min/, bad);
    assert.ok(!fs.existsSync(path.join(repo, ".superpowers")), bad);
  }
});

test("run: 맥락 파일 안의 {{NAME}}은 채우지 못한 자리표시자로 보지 않는다", { skip }, () => {
  const { repo } = makeRepo();
  fs.writeFileSync(path.join(repo, "ctx.md"), "Template uses {{USER_NAME}} here.\n");
  const run = runTask(repo, ["run", "--role", "implement", "--task", "1", "--context", "ctx.md", "--dry-run"]);
  assert.equal(run.status, 0, run.stderr);
});

test("review: 새 커밋이 없어도 빈 검수 자료를 만들고 0으로 끝난다", { skip }, () => {
  const { repo, git } = makeRepo();
  const base = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(repo, "findings.md"), "- f\n");
  for (const kind of ["rereview", "task"]) {
    const review = runTask(repo, ["review", "--kind", kind, "--task", "1", "--base", base, "--findings", "findings.md"]);
    assert.equal(review.status, 0, review.stderr);
    const packageRel = /package=(\S+)/.exec(review.stdout)?.[1];
    assert.ok(packageRel, kind);
    assert.match(fs.readFileSync(path.join(repo, packageRel), "utf8"), /No new commits/);
  }
});
