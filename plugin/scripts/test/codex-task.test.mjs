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
