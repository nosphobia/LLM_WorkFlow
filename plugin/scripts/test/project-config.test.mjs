import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { PROJECT_CONFIG_REL, codexTmpDir, buildProjectConfig, hashText, checkEffectiveConfig, findAppsTools } from "../lib/project-config.mjs";

const repoDir = "C:\\work\\repo";
const shimDir = "D:\\plugin\\scripts\\sandbox-python";
const tmp = path.join(repoDir, ".superpowers", "sdd", "codex-tmp");

test("설정 파일 경로와 명령 전용 임시 폴더", () => {
  assert.equal(PROJECT_CONFIG_REL, path.join(".codex", "config.toml"));
  assert.equal(codexTmpDir(repoDir), tmp);
});

test("외부 연결 도구를 끄고 명령 환경을 정하는 설정을 만든다", () => {
  const text = buildProjectConfig({ repoDir, shimDir });
  assert.match(text, /^# llm-workflow 래퍼가 관리한다/);
  assert.match(text, /^\[features\]\napps = false$/m);
  assert.match(text, /^\[shell_environment_policy\]$/m);
  assert.ok(text.includes(`set = { TEMP = '${tmp}', TMP = '${tmp}', PYTHONPATH = '${shimDir}' }`));
  assert.doesNotMatch(text, /multi_agent/);
  assert.throws(() => buildProjectConfig({ repoDir: "C:\\it's", shimDir }), /쓸 수 없는 문자/);
});

test("해시는 내용이 같으면 같고 다르면 다르다", () => {
  assert.equal(hashText("a"), hashText("a"));
  assert.notEqual(hashText("a"), hashText("b"));
  assert.equal(hashText(null), hashText(""));
});

const configRead = ({ disabled = false, apps = false, set = { TEMP: tmp, TMP: tmp, PYTHONPATH: shimDir } } = {}) => ({
  config: { features: { apps }, shell_environment_policy: { set } },
  layers: [{ name: { type: "project", dotCodexFolder: path.join(repoDir, ".codex") }, ...(disabled ? { disabledReason: "add as a trusted project" } : {}) }, { name: { type: "user" } }]
});

test("실제 설정이 맞으면 문제가 없다 (경로 대소문자는 가리지 않는다)", () => {
  assert.deepEqual(checkEffectiveConfig(configRead(), { repoDir, shimDir }), { problems: [], projectDisabled: false });
  const upper = configRead({ set: { TEMP: tmp.toUpperCase(), TMP: tmp, PYTHONPATH: shimDir } });
  assert.deepEqual(checkEffectiveConfig(upper, { repoDir, shimDir }).problems, []);
});

test("프로젝트 층이 꺼졌거나 값이 다르면 문제로 알린다", () => {
  const disabled = checkEffectiveConfig(configRead({ disabled: true }), { repoDir, shimDir });
  assert.equal(disabled.projectDisabled, true);
  assert.match(disabled.problems.join("; "), /프로젝트 Codex 설정이 꺼져 있습니다/);
  assert.match(checkEffectiveConfig(configRead({ apps: true }), { repoDir, shimDir }).problems.join("; "), /features\.apps/);
  const wrongTemp = checkEffectiveConfig(configRead({ set: { TEMP: "C:\\Temp", TMP: tmp, PYTHONPATH: shimDir } }), { repoDir, shimDir });
  assert.match(wrongTemp.problems.join("; "), /명령 환경 TEMP가 다릅니다: C:\\Temp/);
  const noLayer = checkEffectiveConfig({ config: {}, layers: [] }, { repoDir, shimDir });
  assert.match(noLayer.problems.join("; "), /프로젝트 Codex 설정 층이 없습니다/);
});

test("MCP 상태에서 외부 연결 도구를 찾는다", () => {
  const on = { data: [{ name: "node_repl", tools: { js: {} } }, { name: "codex_apps", tools: { gmail_send_email: {}, google_drive_delete_file: {} } }] };
  assert.deepEqual(findAppsTools(on), { present: true, tools: ["codex_apps.gmail_send_email", "codex_apps.google_drive_delete_file"] });
  assert.deepEqual(findAppsTools({ data: [{ name: "node_repl", tools: { js: {} } }] }), { present: false, tools: [] });
  assert.deepEqual(findAppsTools({ data: [{ name: "codex_apps", toolsError: "x" }] }), { present: true, tools: [] });
  assert.deepEqual(findAppsTools(null), { present: false, tools: [] });
});
