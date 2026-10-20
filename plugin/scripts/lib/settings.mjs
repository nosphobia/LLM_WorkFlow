// 워크플로우 설정 파일(plugin/settings/workflow-settings.json)을 읽고 한도 기준값을 계산한다.
// 기준값은 "그 창의 남은 양(%)이 이 값 이상이어야 한다"는 뜻이다.
export const PHASES = Object.freeze(["plan", "execute", "call"]);
const RULE_KEYS = ["plan", "executeBase", "executePerTask", "call"];

export function parseSettings(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `설정 파일을 해석할 수 없습니다: ${error.message}` };
  }
  if (!Array.isArray(data?.protectedPaths) || data.protectedPaths.some((item) => typeof item !== "string" || item === "")) {
    return { ok: false, error: "설정 파일의 protectedPaths가 문자열 목록이 아닙니다" };
  }
  if (!data.limits || typeof data.limits !== "object") return { ok: false, error: "설정 파일에 limits가 없습니다" };
  for (const [plan, windows] of Object.entries(data.limits)) {
    for (const [minutes, rule] of Object.entries(windows ?? {})) {
      for (const key of RULE_KEYS) {
        if (typeof rule?.[key] !== "number" || rule[key] < 0) {
          return { ok: false, error: `설정 파일 limits.${plan}.${minutes}.${key}가 0 이상의 수가 아닙니다` };
        }
      }
    }
  }
  // 래퍼가 프로젝트 Codex 설정에 TOML 리터럴 문자열로 쓰므로 작은따옴표와 줄바꿈은 받지 않는다.
  for (const key of ["model", "reasoningEffort", "escalatedReasoningEffort"]) {
    const value = data.codex?.[key];
    if (typeof value !== "string" || value.trim() === "" || /['\r\n]/.test(value)) {
      return { ok: false, error: `설정 파일의 codex.${key}가 비어 있지 않은 문자열이 아니거나 쓸 수 없는 문자가 있습니다` };
    }
  }
  return { ok: true, settings: data };
}

// 스킬은 추론을 올릴 때 --effort escalated를 준다. 기본값보다 낮은 단계로 "올리는" 일을 막으려고 값을 설정 파일에 둔다.
export function resolveEffort(effort, settings) {
  return effort === "escalated" ? settings.codex.escalatedReasoningEffort : effort;
}

export function requiredRemaining(rule, phase, tasks = 0) {
  if (phase === "plan") return rule.plan;
  if (phase === "call") return rule.call;
  return Math.min(100, rule.executeBase + rule.executePerTask * Math.max(0, tasks));
}
