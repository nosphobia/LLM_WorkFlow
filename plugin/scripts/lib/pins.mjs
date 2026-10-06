// 3단계에서 고정한 버전과 경로, 래퍼의 상수. 버전을 올릴 때는 이 파일을 고치고 연결부 점검을 다시 돌린다.
import os from "node:os";
import path from "node:path";

export const PINS = Object.freeze({
  codexPlugin: { key: "codex@openai-codex", version: "1.0.4", sha: "807e03a" },
  claudeSuperpowers: { key: "superpowers@claude-plugins-official", version: "6.4.1", sha: "5bf4e78" },
  codexSuperpowers: { name: "superpowers", version: "6.4.1" }
});

export const EXIT = Object.freeze({ OK: 0, STOPPED: 2, FAILED: 3, LIMIT: 4, ENVIRONMENT: 5 });

export const DEFAULT_TIMEOUT_MIN = 30;
export const USAGE_FILE = "codex-calls.jsonl";
export const ROLES = Object.freeze(["plan", "plan-fix", "implement", "fix", "final-fix", "check"]);
export const EFFORTS = Object.freeze(["none", "minimal", "low", "medium", "high", "xhigh"]);

export function defaultPaths(home = os.homedir()) {
  const cache = path.join(home, ".claude", "plugins", "cache");
  return {
    installedPlugins: path.join(home, ".claude", "plugins", "installed_plugins.json"),
    codexLib: path.join(cache, "openai-codex", "codex", PINS.codexPlugin.version, "scripts", "lib", "codex.mjs"),
    codexBrokerLib: path.join(cache, "openai-codex", "codex", PINS.codexPlugin.version, "scripts", "lib", "broker-lifecycle.mjs"),
    superpowersRoot: path.join(cache, "claude-plugins-official", "superpowers", PINS.claudeSuperpowers.version),
    codexConfig: path.join(home, ".codex", "config.toml"),
    codexSessions: path.join(home, ".codex", "sessions")
  };
}
