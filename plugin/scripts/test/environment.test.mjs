import test from "node:test";
import assert from "node:assert/strict";
import {
  checkInstalledPlugins,
  checkCodexPluginList,
  checkSandboxConfig,
  collectEnvironmentProblems
} from "../lib/environment.mjs";

const installed = (plugins = {}) => JSON.stringify({
  version: 2,
  plugins: {
    "codex@openai-codex": [{ scope: "user", version: "1.0.4", gitCommitSha: "807e03ac9d5aa23bc395fdec8c3767500a86b3cf" }],
    "superpowers@claude-plugins-official": [{ scope: "user", version: "6.4.1", gitCommitSha: "5bf4e78011075bcfc0dc295f0724994cd123ee71" }],
    ...plugins
  }
});

const pluginList = (...rows) => [
  "Marketplace `openai-codex`",
  "C:\\Users\\x\\.codex\\.tmp\\marketplaces\\openai-codex\\.claude-plugin\\marketplace.json",
  "",
  "PLUGIN              STATUS              VERSION  SOURCE",
  "codex@openai-codex  installed, enabled  1.0.6    C:\\Users\\x\\codex",
  "",
  "Marketplace `openai-curated-remote`",
  "Remote catalog",
  "",
  "PLUGIN                             STATUS              VERSION  SOURCE",
  ...rows
].join("\n");

const PINNED_ROW = "superpowers@superpowers-dev        installed, enabled  6.4.1    C:\\Users\\x\\superpowers";
const CURATED_ROW = "superpowers@openai-curated-remote  installed, enabled  6.4.2    plugins~Plugin_60aea7";
const CURATED_REMOVED_ROW = "superpowers@openai-curated-remote  not installed       6.4.2    plugins~Plugin_60aea7";

test("고정 버전과 커밋이 맞으면 문제가 없다", () => {
  assert.deepEqual(checkInstalledPlugins(installed()), []);
});

test("Claude Code 쪽 버전이나 커밋이 다르면 문제다", () => {
  const problems = checkInstalledPlugins(installed({
    "superpowers@claude-plugins-official": [{ version: "6.4.2", gitCommitSha: "aaaaaaa" }]
  }));
  assert.equal(problems.length, 2);
  assert.match(problems[0], /6\.4\.2/);
  assert.match(problems[1], /aaaaaaa/);
});

test("설치 기록이 없거나 해석할 수 없으면 문제다", () => {
  const data = JSON.parse(installed());
  delete data.plugins["codex@openai-codex"];
  assert.match(checkInstalledPlugins(JSON.stringify(data))[0], /codex@openai-codex/);
  assert.equal(checkInstalledPlugins("{").length, 1);
});

test("Codex 쪽 Superpowers가 6.4.1 하나만 켜져 있으면 문제가 없다", () => {
  assert.deepEqual(checkCodexPluginList(pluginList(PINNED_ROW, CURATED_REMOVED_ROW)), []);
});

test("Codex 쪽 Superpowers 버전이 다르면 문제다", () => {
  const problems = checkCodexPluginList(pluginList(CURATED_ROW));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /6\.4\.2/);
});

test("Codex 쪽 Superpowers가 두 곳에서 설치되어 있으면 문제다", () => {
  assert.match(checkCodexPluginList(pluginList(PINNED_ROW, CURATED_ROW))[0], /여러 곳/);
});

test("Codex 쪽 Superpowers가 없거나 꺼져 있으면 문제다", () => {
  assert.match(checkCodexPluginList(pluginList(CURATED_REMOVED_ROW))[0], /설치되어 있지 않습니다/);
  const disabled = "superpowers@superpowers-dev        installed, disabled  6.4.1    C:\\Users\\x\\superpowers";
  assert.match(checkCodexPluginList(pluginList(disabled))[0], /켜져 있지 않습니다/);
});

test("지금의 Codex 설정에는 샌드박스 경계 문제가 없다", () => {
  const text = 'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "high"\n[windows]\nsandbox = "unelevated"\n';
  assert.deepEqual(checkSandboxConfig([{ path: "config.toml", text }]), []);
});

test("샌드박스 경계를 넓히는 설정을 찾는다", () => {
  const text = [
    'sandbox_mode = "danger-full-access"',
    "[sandbox_workspace_write]",
    "network_access = true",
    'writable_roots = ["C:\\\\tmp"]',
    "profiles.fast.sandbox_workspace_write.network_access = true"
  ].join("\n");
  const problems = checkSandboxConfig([{ path: "config.toml", text }]);
  assert.equal(problems.length, 4);
  assert.ok(problems.every((p) => p.startsWith("config.toml: ")));
});

test("빈 writable_roots, 주석, 없는 파일은 문제가 아니다", () => {
  const text = "writable_roots = []\n# network_access = true\n";
  assert.deepEqual(checkSandboxConfig([{ path: "a", text }, { path: "b", text: null }]), []);
});

test("여러 줄에 걸친 writable_roots는 문제다", () => {
  assert.equal(checkSandboxConfig([{ path: "a", text: "writable_roots = [\n  'C:/x',\n]" }]).length, 1);
});

test("환경 점검은 라이브러리, 설치 기록, Codex 플러그인 목록, 설정을 모두 본다", () => {
  const paths = { codexLib: "lib.mjs", installedPlugins: "installed.json", codexConfig: "config.toml" };
  const files = { "installed.json": installed(), "config.toml": 'model = "x"\n' };
  const base = {
    repoDir: "repo",
    paths,
    readText: (file) => files[file] ?? null,
    fileExists: () => true,
    codexPluginList: () => pluginList(PINNED_ROW)
  };
  assert.deepEqual(collectEnvironmentProblems(base), []);

  const broken = collectEnvironmentProblems({
    ...base,
    fileExists: () => false,
    codexPluginList: () => {
      throw new Error("codex not found");
    }
  });
  assert.equal(broken.length, 2);
  assert.match(broken[0], /라이브러리/);
  assert.match(broken[1], /codex not found/);
});
