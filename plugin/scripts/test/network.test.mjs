import test from "node:test";
import assert from "node:assert/strict";
import { findNetworkCommands } from "../lib/network.mjs";

test("네트워크를 쓰는 명령을 찾는다", () => {
  const cases = [
    ["pip install requests", ["pip install"]],
    ["python -m pip install x", ["pip install"]],
    ["npm i lodash", ["npm/yarn/pnpm"]],
    ["curl.exe -s https://example.com", ["download", "url"]],
    ["Invoke-WebRequest -Uri https://example.com", ["download", "url"]],
    ["git clone https://github.com/a/b", ["git remote", "url"]],
    ["winget install x", ["system package"]]
  ];
  for (const [command, matches] of cases) {
    const found = findNetworkCommands([command]);
    assert.equal(found.length, 1, command);
    assert.deepEqual(found[0].matches, matches, command);
    assert.equal(found[0].command, command);
  }
});

test("네트워크를 쓰지 않는 명령은 찾지 않는다", () => {
  const commands = ["python -m unittest", "Get-Content -Raw 'C:\\x\\SKILL.md'", "git status", "git log -1", "npm test", "npm init"];
  assert.deepEqual(findNetworkCommands(commands), []);
  assert.deepEqual(findNetworkCommands(undefined), []);
  assert.deepEqual(findNetworkCommands([]), []);
});

test("긴 명령은 공백을 줄이고 300자로 자른다", () => {
  const found = findNetworkCommands([`curl   ${"x".repeat(400)}`]);
  assert.equal(found[0].command.length, 300);
  assert.ok(found[0].command.startsWith("curl x"));
});
