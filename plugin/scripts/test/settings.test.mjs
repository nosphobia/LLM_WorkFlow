import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseSettings, requiredRemaining, PHASES } from "../lib/settings.mjs";
import { pluginPaths, PLUGIN_ROOT, defaultPaths } from "../lib/pins.mjs";

test("플러그인 경로는 플러그인 최상위 기준이다", () => {
  const paths = pluginPaths();
  assert.equal(paths.settingsFile, path.join(PLUGIN_ROOT, "settings", "workflow-settings.json"));
  assert.equal(paths.shimDir, path.join(PLUGIN_ROOT, "scripts", "sandbox-python"));
  assert.equal(paths.codexTaskScript, path.join(PLUGIN_ROOT, "scripts", "codex-task.mjs"));
  assert.ok(defaultPaths().codexAppServerLib.endsWith(path.join("scripts", "lib", "app-server.mjs")));
});

test("실제 설정 파일을 읽을 수 있고 보호 경로와 두 요금제 기준이 있다", () => {
  const parsed = parseSettings(fs.readFileSync(pluginPaths().settingsFile, "utf8"));
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(parsed.settings.protectedPaths, [".claude/", ".githooks/", "CLAUDE.md", ".codex/"]);
  assert.deepEqual(Object.keys(parsed.settings.limits).sort(), ["plus", "prolite"]);
  assert.deepEqual(parsed.settings.limits.plus["300"], { plan: 50, executeBase: 0, executePerTask: 18, call: 30 });
  assert.deepEqual(parsed.settings.limits.plus["10080"], { plan: 10, executeBase: 7, executePerTask: 3, call: 5 });
  assert.deepEqual(parsed.settings.limits.prolite["10080"], { plan: 5, executeBase: 5, executePerTask: 2, call: 5 });
  assert.deepEqual(parsed.settings.codex, { model: "gpt-5.6-sol", reasoningEffort: "ultra" });
});

test("Codex 모델과 추론 강도가 없거나 쓸 수 없는 값이면 거부한다", () => {
  const base = { protectedPaths: ["x"], limits: {} };
  assert.match(parseSettings(JSON.stringify(base)).error, /codex\.model/);
  assert.match(parseSettings(JSON.stringify({ ...base, codex: { model: "", reasoningEffort: "ultra" } })).error, /codex\.model/);
  assert.match(parseSettings(JSON.stringify({ ...base, codex: { model: "gpt-5.6-sol" } })).error, /codex\.reasoningEffort/);
  assert.match(parseSettings(JSON.stringify({ ...base, codex: { model: "it's", reasoningEffort: "ultra" } })).error, /codex\.model/);
  assert.equal(parseSettings(JSON.stringify({ ...base, codex: { model: "gpt-5.6-sol", reasoningEffort: "ultra" } })).ok, true);
});

test("형식이 틀린 설정은 이유와 함께 거부한다", () => {
  assert.match(parseSettings("{").error, /해석할 수 없습니다/);
  assert.match(parseSettings(JSON.stringify({ limits: {} })).error, /protectedPaths/);
  assert.match(parseSettings(JSON.stringify({ protectedPaths: ["x"] })).error, /limits/);
  const bad = { protectedPaths: ["x"], limits: { plus: { 300: { plan: 1, executeBase: 0, executePerTask: -1, call: 1 } } }, codex: { model: "m", reasoningEffort: "e" } };
  assert.match(parseSettings(JSON.stringify(bad)).error, /limits\.plus\.300\.executePerTask/);
});

test("단계별 필요 남은 양을 계산하고 실행 기준은 100을 넘지 않는다", () => {
  assert.deepEqual(PHASES, ["plan", "execute", "call"]);
  const rule = { plan: 50, executeBase: 7, executePerTask: 18, call: 30 };
  assert.equal(requiredRemaining(rule, "plan"), 50);
  assert.equal(requiredRemaining(rule, "call"), 30);
  assert.equal(requiredRemaining(rule, "execute", 3), 61);
  assert.equal(requiredRemaining(rule, "execute", 10), 100);
  assert.equal(requiredRemaining(rule, "execute"), 7);
});
