// 3단계에서 고정한 버전과 경로, 래퍼의 상수. 버전을 올릴 때는 이 파일을 고치고 연결부 점검을 다시 돌린다.
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PINS = Object.freeze({
  codexPlugin: { key: "codex@openai-codex", version: "1.0.4", sha: "807e03a" },
  claudeSuperpowers: { key: "superpowers@claude-plugins-official", version: "6.4.1", sha: "5bf4e78" },
  codexSuperpowers: { name: "superpowers", version: "6.4.1" }
});

export const EXIT = Object.freeze({ OK: 0, STOPPED: 2, FAILED: 3, LIMIT: 4, ENVIRONMENT: 5 });

export const DEFAULT_TIMEOUT_MIN = 30;
export const USAGE_FILE = "codex-calls.jsonl";
export const ROLES = Object.freeze(["plan", "plan-fix", "implement", "fix", "final-fix", "check"]);
// Codex 단계는 low < medium < high < xhigh < max < ultra다(ultra는 작업 자동 위임이 붙는다). escalated는 설정의 "올린 추론 강도"를 뜻한다.
export const EFFORTS = Object.freeze(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra", "escalated"]);

export function defaultPaths(home = os.homedir()) {
  const cache = path.join(home, ".claude", "plugins", "cache");
  return {
    installedPlugins: path.join(home, ".claude", "plugins", "installed_plugins.json"),
    codexLib: path.join(cache, "openai-codex", "codex", PINS.codexPlugin.version, "scripts", "lib", "codex.mjs"),
    codexBrokerLib: path.join(cache, "openai-codex", "codex", PINS.codexPlugin.version, "scripts", "lib", "broker-lifecycle.mjs"),
    codexAppServerLib: path.join(cache, "openai-codex", "codex", PINS.codexPlugin.version, "scripts", "lib", "app-server.mjs"),
    superpowersRoot: path.join(cache, "claude-plugins-official", "superpowers", PINS.claudeSuperpowers.version),
    codexConfig: path.join(home, ".codex", "config.toml"),
    codexSessions: path.join(home, ".codex", "sessions")
  };
}

// 이 플러그인의 최상위 폴더(plugin/). 설정 파일과 보정 모듈은 운영 폴더에 있어 Codex 샌드박스가 쓸 수 없다.
export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function pluginPaths(root = PLUGIN_ROOT) {
  return {
    settingsFile: path.join(root, "settings", "workflow-settings.json"),
    shimDir: path.join(root, "scripts", "sandbox-python"),
    codexTaskScript: path.join(root, "scripts", "codex-task.mjs")
  };
}
