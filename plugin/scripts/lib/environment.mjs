// 래퍼가 Codex를 부르기 전에 고정 버전과 Codex 샌드박스 경계 설정을 확인한다.
import path from "node:path";
import { PINS } from "./pins.mjs";

export function checkInstalledPlugins(jsonText, pins = PINS) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return ["installed_plugins.json을 해석할 수 없습니다"];
  }
  const problems = [];
  for (const pin of [pins.codexPlugin, pins.claudeSuperpowers]) {
    const entry = data?.plugins?.[pin.key]?.[0];
    if (!entry) {
      problems.push(`${pin.key}: 설치 기록이 없습니다`);
      continue;
    }
    if (entry.version !== pin.version) problems.push(`${pin.key}: 버전 ${entry.version} (고정값 ${pin.version})`);
    const sha = String(entry.gitCommitSha ?? "");
    if (!sha.startsWith(pin.sha)) problems.push(`${pin.key}: 커밋 ${sha.slice(0, 7) || "없음"} (고정값 ${pin.sha})`);
  }
  return problems;
}

export function checkCodexPluginList(listText, pin = PINS.codexSuperpowers) {
  const rows = listText
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s{2,}/))
    .filter(([plugin = "", status = ""]) => plugin.startsWith(`${pin.name}@`) && status.startsWith("installed"));
  if (rows.length === 0) return [`Codex 쪽 ${pin.name}가 설치되어 있지 않습니다`];
  if (rows.length > 1) {
    return [`Codex 쪽 ${pin.name}가 여러 곳에서 설치되어 있습니다: ${rows.map(([plugin]) => plugin).join(", ")}`];
  }
  const [plugin, status, version] = rows[0];
  const problems = [];
  if (!/\benabled\b/.test(status)) problems.push(`Codex 쪽 ${plugin}가 켜져 있지 않습니다 (${status})`);
  if (version !== pin.version) problems.push(`Codex 쪽 ${plugin}: 버전 ${version} (고정값 ${pin.version})`);
  return problems;
}

const key = (name) => new RegExp(`^\\s*(?:[\\w."'-]+\\.)?${name}\\s*=`);

const SANDBOX_RULES = [
  {
    test: (line) => key("sandbox_mode").test(line) && /danger-full-access/.test(line),
    message: "전체 접근 모드(danger-full-access)가 설정되어 있습니다"
  },
  {
    test: (line) => key("network_access").test(line) && /=\s*true\b/.test(line),
    message: "네트워크 허용(network_access = true)이 설정되어 있습니다"
  },
  {
    test: (line) => key("writable_roots").test(line) && !/=\s*\[\s*\]/.test(line),
    message: "추가 쓰기 경로(writable_roots)가 설정되어 있습니다"
  }
];

export function checkSandboxConfig(files) {
  const problems = [];
  for (const { path: file, text } of files) {
    if (text === null || text === undefined) continue;
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*#/.test(line)) continue;
      for (const rule of SANDBOX_RULES) {
        if (rule.test(line)) problems.push(`${file}: ${rule.message}`);
      }
    }
  }
  return problems;
}

export function collectEnvironmentProblems({ repoDir, paths, readText, fileExists, codexPluginList }) {
  const problems = [];
  if (!fileExists(paths.codexLib)) problems.push(`Codex 플러그인 라이브러리가 없습니다: ${paths.codexLib}`);

  const installed = readText(paths.installedPlugins);
  if (installed === null) problems.push(`설치 기록 파일이 없습니다: ${paths.installedPlugins}`);
  else problems.push(...checkInstalledPlugins(installed));

  let list = null;
  try {
    list = codexPluginList();
  } catch (error) {
    problems.push(`codex plugin list 실행 실패: ${error.message}`);
  }
  if (list !== null) problems.push(...checkCodexPluginList(list));

  const repoConfig = path.join(repoDir, ".codex", "config.toml");
  problems.push(...checkSandboxConfig([
    { path: paths.codexConfig, text: readText(paths.codexConfig) },
    { path: repoConfig, text: readText(repoConfig) }
  ]));
  return problems;
}
