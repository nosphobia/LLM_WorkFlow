import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findProtectedChanges, snapshotProtected } from "../lib/protected.mjs";
import { diffSnapshots } from "../lib/git-changes.mjs";

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

test("보호 폴더 자체가 변경 항목이면(링크로 바뀐 경우) 걸린다", () => {
  assert.deepEqual(findProtectedChanges([".claude", "sub/.githooks", ".claudex", "a.codex"], RULES), [".claude", "sub/.githooks"]);
});

test("변경이 없거나 걸리지 않으면 빈 목록", () => {
  assert.deepEqual(findProtectedChanges([], RULES), []);
  assert.deepEqual(findProtectedChanges(undefined, RULES), []);
  assert.deepEqual(findProtectedChanges(["greet.py", "tests/test_greet.py"], RULES), []);
});

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "protected-test-"));
  const repo = path.join(root, "repo");
  fs.mkdirSync(path.join(repo, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(repo, ".codex"));
  fs.mkdirSync(path.join(repo, "src"));
  fs.writeFileSync(path.join(repo, ".claude", "settings.json"), "{}");
  fs.writeFileSync(path.join(repo, ".codex", "config.toml"), "a");
  fs.writeFileSync(path.join(repo, "CLAUDE.md"), "규칙");
  fs.writeFileSync(path.join(repo, "src", "app.py"), "x");
  return { root, repo };
}

test("보호 폴더 아래 모든 파일과 보호 파일을 git과 상관없이 해시로 적는다", () => {
  const { repo } = makeRepo();
  const before = snapshotProtected(repo, RULES);
  assert.deepEqual(Object.keys(before).sort(), [".claude", ".claude/settings.json", ".codex", ".codex/config.toml", "CLAUDE.md"]);
  fs.writeFileSync(path.join(repo, ".claude", "settings.local.json"), '{"permissions":{}}');
  fs.writeFileSync(path.join(repo, ".codex", "config.toml"), "b");
  fs.writeFileSync(path.join(repo, "src", "app.py"), "y");
  assert.deepEqual(diffSnapshots(before, snapshotProtected(repo, RULES)), [".claude/settings.local.json", ".codex/config.toml"]);
});

test("보호 폴더가 링크로 바뀌면 차이로 잡고, 링크는 따라가지 않는다", () => {
  const { root, repo } = makeRepo();
  const before = snapshotProtected(repo, RULES);
  const outside = path.join(root, "outside");
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "settings.json"), "{}");
  fs.rmSync(path.join(repo, ".claude"), { recursive: true });
  fs.symlinkSync(outside, path.join(repo, ".claude"), "junction");
  const after = snapshotProtected(repo, RULES);
  assert.match(after[".claude"], /^link:/);
  assert.equal(after[".claude/settings.json"], undefined);
  assert.deepEqual(diffSnapshots(before, after), [".claude", ".claude/settings.json"]);
});

test("보호 경로를 읽지 못하면(ENOENT 밖의 오류) 던진다", () => {
  const fsx = {
    lstatSync: () => {
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    }
  };
  assert.throws(() => snapshotProtected("/repo", RULES, fsx), /denied/);
});
