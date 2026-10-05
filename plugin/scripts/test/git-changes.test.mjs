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
