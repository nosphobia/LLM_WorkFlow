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

const pinned = { model: "gpt-5.6-sol", effort: "ultra" };
const expected = { repoDir, shimDir, ...pinned };

test("외부 연결 도구와 메모리를 끄고, 모델·추론 강도와 명령 환경을 정하는 설정을 만든다", () => {
  const text = buildProjectConfig(expected);
  assert.match(text, /^# llm-workflow 래퍼가 관리한다/);
  // TOML의 최상위 키는 첫 표([...]) 앞에 있어야 한다.
  const firstTable = text.search(/^\[/m);
  assert.ok(text.indexOf("model = 'gpt-5.6-sol'\n") < firstTable);
  assert.ok(text.indexOf("model_reasoning_effort = 'ultra'\n") < firstTable);
  assert.match(text, /^\[features\]\napps = false\nmemories = false$/m);
  assert.match(text, /^\[memories\]\ngenerate_memories = false\nuse_memories = false$/m);
  assert.match(text, /^\[sandbox_workspace_write\]\nnetwork_access = false\nwritable_roots = \[\]$/m);
  assert.match(text, /^\[shell_environment_policy\]$/m);
  assert.ok(text.includes(`set = { TEMP = '${tmp}', TMP = '${tmp}', PYTHONPATH = '${shimDir}' }`));
  assert.doesNotMatch(text, /multi_agent/);
  assert.throws(() => buildProjectConfig({ ...expected, repoDir: "C:\\it's" }), /쓸 수 없는 문자/);
  assert.throws(() => buildProjectConfig({ repoDir, shimDir }), /모델/);
});

test("해시는 내용이 같으면 같고 다르면 다르다", () => {
  assert.equal(hashText("a"), hashText("a"));
  assert.notEqual(hashText("a"), hashText("b"));
  assert.equal(hashText(null), hashText(""));
});

const configRead = ({
  disabled = false,
  apps = false,
  memoriesFeature = false,
  memories = { generate_memories: false, use_memories: false },
  model = "gpt-5.6-sol",
  effort = "ultra",
  set = { TEMP: tmp, TMP: tmp, PYTHONPATH: shimDir }
} = {}) => ({
  config: { model, model_reasoning_effort: effort, features: { apps, memories: memoriesFeature }, memories, shell_environment_policy: { set } },
  layers: [{ name: { type: "project", dotCodexFolder: path.join(repoDir, ".codex") }, ...(disabled ? { disabledReason: "add as a trusted project" } : {}) }, { name: { type: "user" } }]
});

test("실제 설정이 맞으면 문제가 없다 (경로 대소문자는 가리지 않는다)", () => {
  assert.deepEqual(checkEffectiveConfig(configRead(), expected), { problems: [], projectDisabled: false });
  const upper = configRead({ set: { TEMP: tmp.toUpperCase(), TMP: tmp, PYTHONPATH: shimDir } });
  assert.deepEqual(checkEffectiveConfig(upper, expected).problems, []);
});

test("프로젝트 층이 꺼졌거나 값이 다르면 문제로 알린다", () => {
  const disabled = checkEffectiveConfig(configRead({ disabled: true }), expected);
  assert.equal(disabled.projectDisabled, true);
  assert.match(disabled.problems.join("; "), /프로젝트 Codex 설정이 꺼져 있습니다/);
  assert.match(checkEffectiveConfig(configRead({ apps: true }), expected).problems.join("; "), /features\.apps/);
  const wrongTemp = checkEffectiveConfig(configRead({ set: { TEMP: "C:\\Temp", TMP: tmp, PYTHONPATH: shimDir } }), expected);
  assert.match(wrongTemp.problems.join("; "), /명령 환경 TEMP가 다릅니다: C:\\Temp/);
  const noLayer = checkEffectiveConfig({ config: {}, layers: [] }, expected);
  assert.match(noLayer.problems.join("; "), /프로젝트 Codex 설정 층이 없습니다/);
});

test("유효 설정에서 샌드박스가 넓어졌으면 표기와 상관없이 문제로 알린다 (인용 키·인라인 테이블도 같은 값으로 읽힌다)", () => {
  const read = (config) => {
    const base = configRead();
    return { ...base, config: { ...base.config, ...config } };
  };
  const problems = (config) => checkEffectiveConfig(read(config), expected).problems.join("; ");
  assert.equal(problems({ sandbox_mode: null, sandbox_workspace_write: { network_access: false, writable_roots: [] } }), "");
  assert.match(problems({ sandbox_mode: "danger-full-access" }), /danger-full-access/);
  assert.match(problems({ sandbox_workspace_write: { network_access: true, writable_roots: [] } }), /network_access/);
  assert.match(problems({ sandbox_workspace_write: { network_access: false, writable_roots: ["D:\\outside"] } }), /writable_roots.*D:\\outside/);
});

test("모델·추론 강도가 워크플로우 설정과 다르거나 메모리가 꺼지지 않았으면 문제로 알린다", () => {
  const problems = (overrides) => checkEffectiveConfig(configRead(overrides), expected).problems.join("; ");
  assert.match(problems({ model: "gpt-6-astra" }), /모델이 다릅니다: gpt-6-astra \(설정 gpt-5\.6-sol\)/);
  assert.match(problems({ effort: "high" }), /추론 강도가 다릅니다: high \(설정 ultra\)/);
  assert.match(problems({ memoriesFeature: true }), /features\.memories/);
  assert.match(problems({ memories: { generate_memories: false } }), /memories\.use_memories/);
  assert.match(problems({ memories: { generate_memories: true, use_memories: false } }), /memories\.generate_memories/);
  assert.match(checkEffectiveConfig({ config: {}, layers: configRead().layers }, expected).problems.join("; "), /모델이 다릅니다: 없음/);
});

test("MCP 상태에서 외부 연결 도구를 찾는다", () => {
  const on = { data: [{ name: "node_repl", tools: { js: {} } }, { name: "codex_apps", tools: { gmail_send_email: {}, google_drive_delete_file: {} } }] };
  assert.deepEqual(findAppsTools(on), { present: true, tools: ["codex_apps.gmail_send_email", "codex_apps.google_drive_delete_file"] });
  assert.deepEqual(findAppsTools({ data: [{ name: "node_repl", tools: { js: {} } }] }), { present: false, tools: [] });
  assert.deepEqual(findAppsTools({ data: [{ name: "codex_apps", toolsError: "x" }] }), { present: true, tools: [] });
  assert.throws(() => findAppsTools(null), /mcpServerStatus\/list/);
  assert.throws(() => findAppsTools({}), /mcpServerStatus\/list/);
});

test("MCP 상태의 항목 형식이 예상과 다르면 없음으로 읽지 않고 던진다", () => {
  assert.deepEqual(findAppsTools({ data: [] }), { present: false, tools: [] });
  for (const data of [[null], [{ serverName: "codex_apps" }], [{ name: 7 }], [{ name: "codex_apps", tools: ["a"] }], [{ name: "codex_apps", tools: null }]]) {
    assert.throws(() => findAppsTools({ data }), /항목 형식/, JSON.stringify(data));
  }
});
