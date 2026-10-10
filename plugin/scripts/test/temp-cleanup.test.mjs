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

test("폴더를 읽지 못해도 던지지 않고 failed에 담는다", () => {
  const fsx = { existsSync: () => true, readdirSync: () => { throw Object.assign(new Error("denied"), { code: "EPERM" }); } };
  const result = emptyDir("/x/tmp", fsx);
  assert.deepEqual(result.removed, []);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0], /EPERM/);
});

test("새로 생겼고 git이 무시하지 않으며 변경이 없는 폴더만 수상하다", () => {
  const before = ["src"];
  const after = ["cache", "pkg", "src", "tmpabc"];
  const changed = ["pkg/__init__.py", "src/app.py"];
  const isIgnored = (name) => name === "cache/";
  assert.deepEqual(suspiciousNewDirs(before, after, changed, isIgnored), ["tmpabc"]);
});
