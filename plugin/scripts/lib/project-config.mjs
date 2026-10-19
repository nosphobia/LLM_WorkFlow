// 래퍼가 관리하는 프로젝트 Codex 설정(.codex/config.toml)을 만들고, Codex가 실제로 그 설정을 쓰는지 확인한다.
// 외부 연결 도구(features.apps)를 끄고, Codex가 실행하는 명령에만 TEMP·TMP·PYTHONPATH를 준다(명세 3절, 4절).
// 모델·추론 강도는 워크플로우 설정 파일 값으로 고정하고, 메모리는 읽기와 생성 모두 끈다.
// 사용자 Codex 설정을 따르면 시험 조건이 바뀌고, 메모리가 켜져 있으면 다른 프로젝트의 기억이 섞인다(2026-10-20 재측정).
import crypto from "node:crypto";
import path from "node:path";

export const PROJECT_CONFIG_REL = path.join(".codex", "config.toml");

export const codexTmpDir = (repoDir) => path.join(repoDir, ".superpowers", "sdd", "codex-tmp");

// TOML 리터럴 문자열(작은따옴표)은 역슬래시를 그대로 둔다. 작은따옴표와 줄바꿈은 넣을 수 없다.
function literal(value) {
  if (value.includes("'") || /[\r\n]/.test(value)) throw new Error(`설정 값에 쓸 수 없는 문자가 있습니다: ${value}`);
  return `'${value}'`;
}

export function buildProjectConfig({ repoDir, shimDir, model, effort }) {
  if (typeof model !== "string" || typeof effort !== "string") throw new Error("프로젝트 Codex 설정에 넣을 모델과 추론 강도가 없습니다");
  const tmp = codexTmpDir(repoDir);
  return [
    "# llm-workflow 래퍼가 관리한다. 직접 고치지 않는다.",
    `model = ${literal(model)}`,
    `model_reasoning_effort = ${literal(effort)}`,
    "",
    "[features]",
    "apps = false",
    "memories = false",
    "",
    "[memories]",
    "generate_memories = false",
    "use_memories = false",
    "",
    "[shell_environment_policy]",
    `set = { TEMP = ${literal(tmp)}, TMP = ${literal(tmp)}, PYTHONPATH = ${literal(shimDir)} }`,
    ""
  ].join("\n");
}

export const hashText = (text) => crypto.createHash("sha256").update(text ?? "").digest("hex");

export function checkEffectiveConfig(configRead, { repoDir, shimDir, model, effort }) {
  const problems = [];
  const project = (configRead?.layers ?? []).find((layer) => layer?.name?.type === "project");
  if (!project) problems.push("프로젝트 Codex 설정 층이 없습니다");
  else if (project.disabledReason) problems.push(`프로젝트 Codex 설정이 꺼져 있습니다: ${project.disabledReason}`);
  const config = configRead?.config ?? {};
  if (config.features?.apps !== false) problems.push("외부 연결 도구(features.apps)가 꺼져 있지 않습니다");
  if (config.model !== model) problems.push(`모델이 다릅니다: ${config.model ?? "없음"} (설정 ${model})`);
  if (config.model_reasoning_effort !== effort) problems.push(`추론 강도가 다릅니다: ${config.model_reasoning_effort ?? "없음"} (설정 ${effort})`);
  if (config.features?.memories !== false) problems.push("메모리 기능(features.memories)이 꺼져 있지 않습니다");
  for (const key of ["use_memories", "generate_memories"]) {
    if (config.memories?.[key] !== false) problems.push(`메모리 설정(memories.${key})이 꺼져 있지 않습니다`);
  }
  const set = config.shell_environment_policy?.set ?? {};
  const tmp = codexTmpDir(repoDir);
  for (const [key, want] of [["TEMP", tmp], ["TMP", tmp], ["PYTHONPATH", shimDir]]) {
    if (String(set[key] ?? "").toLowerCase() !== want.toLowerCase()) problems.push(`명령 환경 ${key}가 다릅니다: ${set[key] ?? "없음"}`);
  }
  return { problems, projectDisabled: Boolean(project?.disabledReason) };
}

export function findAppsTools(statusResponse) {
  if (!Array.isArray(statusResponse?.data)) throw new Error("mcpServerStatus/list 응답 형식이 예상과 다릅니다");
  const servers = statusResponse.data.filter((server) => server?.name === "codex_apps");
  return {
    present: servers.length > 0,
    tools: servers.flatMap((server) => Object.keys(server.tools ?? {}).map((tool) => `codex_apps.${tool}`)).sort()
  };
}
