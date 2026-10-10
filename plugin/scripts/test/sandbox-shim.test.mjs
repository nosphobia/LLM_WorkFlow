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
  return spawnSync("python", ["-c", SCRIPT], { encoding: "utf8", timeout: 60_000, env: { ...env, PYTHONDONTWRITEBYTECODE: "1" } });
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
