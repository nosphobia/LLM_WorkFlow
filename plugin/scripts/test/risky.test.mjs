import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRiskyCommands } from "../lib/risky.mjs";

const fixtureFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "trial-commands.json");

test("위험한 명령을 종류별로 찾는다", () => {
  const cases = [
    ["taskkill /F /PID 1234", ["프로세스 종료"]],
    ["taskkill.exe /IM node.exe /F", ["프로세스 종료"]],
    ["Get-Process node | Stop-Process -Force", ["프로세스 종료"]],
    ["kill -9 4321", ["프로세스 종료"]],
    ["wmic process where name='x.exe' delete", ["프로세스 종료"]],
    ["takeown /F C:\\x", ["권한 변경"]],
    ["icacls.exe 'C:\\x' /grant 'me:(OI)(CI)F'", ["권한 변경"]],
    ["Set-Acl -Path x -AclObject $acl", ["권한 변경"]],
    ["[System.IO.Directory]::Delete('C:\\x')", ["삭제 우회"]],
    ['const r = await tools.exec_command({"cmd":"[System.IO.File]::Delete(\'a\')"})', ["삭제 우회"]]
  ];
  for (const [command, matches] of cases) {
    const found = findRiskyCommands([command]);
    assert.equal(found.length, 1, command);
    assert.deepEqual(found[0].matches, matches, command);
  }
});

test("명령 단어가 아닌 곳과 파일 수정 내용에는 걸리지 않는다", () => {
  const commands = [
    "Get-Content -Raw 'C:\\Users\\a\\.codex\\plugins\\cache\\superpowers\\skills\\using-superpowers\\SKILL.md'",
    "rg -n skill docs",
    "python -c \"print('killed')\"",
    "Write-Output Kill-Switch",
    "icacls 'C:\\x'",
    "git log --oneline",
    "*** Begin Patch\n*** Add File: notes.md\n+we must not kill processes; taskkill is banned\n*** End Patch"
  ];
  assert.deepEqual(findRiskyCommands(commands), []);
  assert.deepEqual(findRiskyCommands(undefined), []);
});

test("긴 명령은 공백을 줄이고 300자로 자른다", () => {
  const found = findRiskyCommands([`taskkill   /PID 1 ${"x".repeat(400)}`]);
  assert.equal(found[0].command.length, 300);
  assert.ok(found[0].command.startsWith("taskkill /PID 1 x"));
});

test("3단계 시험의 Codex 명령 기록에서는 이미 아는 두 건만 찾는다 (오탐 0)", () => {
  const fixture = JSON.parse(fs.readFileSync(fixtureFile, "utf8"));
  assert.equal(fixture.commands.length, 254);
  const found = findRiskyCommands(fixture.commands);
  assert.equal(found.length, 2, JSON.stringify(found, null, 1));
  const byKind = Object.fromEntries(found.map((item) => [item.matches.join(","), item.command]));
  assert.match(byKind["삭제 우회"], /\[System\.IO\.Directory\]::Delete/);
  assert.match(byKind["권한 변경"], /takeown\.exe/);
});
