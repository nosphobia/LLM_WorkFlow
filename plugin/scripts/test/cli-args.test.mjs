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

test("shutdown은 --cwd만 있으면 된다", () => {
  const parsed = parseCliArgs(["shutdown", "--cwd", repo]);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.action, "shutdown");
  assert.equal(parsed.options.cwd, repo);
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
