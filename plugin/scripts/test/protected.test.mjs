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
