import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkSafePath, readExisting } from "../lib/safe-path.mjs";

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "safe-path-test-"));
  const repo = path.join(root, "repo");
  const outside = path.join(root, "outside");
  fs.mkdirSync(repo);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "keep.txt"), "x");
  return { repo, outside };
}

test("경계 안의 실제 경로는 통과하고, 없는 끝부분은 exists=false로 알린다", () => {
  const { repo } = makeRepo();
  fs.mkdirSync(path.join(repo, ".superpowers"));
  assert.deepEqual(checkSafePath(repo, path.join(repo, ".superpowers", "sdd", "codex-tmp")), { ok: true, exists: false });
  fs.mkdirSync(path.join(repo, ".superpowers", "sdd", "codex-tmp"), { recursive: true });
  assert.deepEqual(checkSafePath(repo, path.join(repo, ".superpowers", "sdd", "codex-tmp")), { ok: true, exists: true });
});

test("경계 밖 경로는 거부한다", () => {
  const { repo, outside } = makeRepo();
  const result = checkSafePath(repo, path.join(outside, "keep.txt"));
  assert.equal(result.ok, false);
  assert.match(result.reason, /경계.*밖/);
});

test("대상이나 상위 경로가 링크(junction)면 거부한다", () => {
  const { repo, outside } = makeRepo();
  fs.mkdirSync(path.join(repo, ".superpowers", "sdd"), { recursive: true });
  fs.symlinkSync(outside, path.join(repo, ".superpowers", "sdd", "codex-tmp"), "junction");
  const self = checkSafePath(repo, path.join(repo, ".superpowers", "sdd", "codex-tmp"));
  assert.equal(self.ok, false);
  assert.match(self.reason, /링크/);

  const other = makeRepo();
  fs.symlinkSync(other.outside, path.join(other.repo, ".codex"), "junction");
  const ancestor = checkSafePath(other.repo, path.join(other.repo, ".codex", "config.toml"));
  assert.equal(ancestor.ok, false);
  assert.match(ancestor.reason, /\.codex.*링크/);
});

test("경로를 확인하지 못하면(ENOENT 밖의 오류) 거부한다", () => {
  const fsx = {
    lstatSync: () => {
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    },
    realpathSync: { native: (p) => p }
  };
  const result = checkSafePath(path.resolve("/repo"), path.resolve("/repo/.codex/config.toml"), fsx);
  assert.equal(result.ok, false);
  assert.match(result.reason, /EACCES/);
});

test("읽기는 ENOENT만 없음(null)으로 보고, 그 밖의 실패는 던진다", () => {
  const { repo } = makeRepo();
  const file = path.join(repo, "a.txt");
  assert.equal(readExisting(file), null);
  fs.writeFileSync(file, "내용");
  assert.equal(readExisting(file), "내용");
  const denied = { readFileSync: () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); } };
  assert.throws(() => readExisting(file, denied), /denied/);
});
