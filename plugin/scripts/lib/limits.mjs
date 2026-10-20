// Codex 한도(account/rateLimits/read 응답)를 설정 파일의 기준과 비교한다. 토큰을 쓰지 않는 확인이다.
import { requiredRemaining } from "./settings.mjs";

export function pickSnapshot(response) {
  return response?.rateLimitsByLimitId?.codex ?? response?.rateLimits ?? null;
}

const formatTime = (epochSec) =>
  epochSec ? new Date(epochSec * 1000).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }) : "-";

export function evaluateLimits(response, settings, { phase, tasks = 0 }) {
  const snapshot = pickSnapshot(response);
  if (!snapshot) return { status: "error", planType: null, reason: "한도 정보를 읽지 못했습니다", windows: [] };
  const planType = snapshot.planType ?? null;
  const rules = planType ? settings.limits?.[planType] : null;
  if (!rules) {
    return {
      status: "error",
      planType,
      reason: `설정 파일에 요금제 ${planType ?? "(없음)"}의 기준값이 없습니다. 요금제를 바꿨다면 plugin/settings/workflow-settings.json에 먼저 추가하세요`,
      windows: []
    };
  }
  const windows = [];
  for (const window of [snapshot.primary, snapshot.secondary]) {
    // 창이 없으면(null) 그 창은 없는 것이다. 있는데 형식이 틀리면 건너뛰지 않는다(확인 실패를 통과로 읽지 않는다).
    if (window === null || window === undefined) continue;
    const used = window.usedPercent;
    if (typeof used !== "number" || !Number.isFinite(used) || used < 0 || used > 100 || !Number.isFinite(window.windowDurationMins)) {
      return { status: "error", planType, reason: `한도 창 형식이 예상과 다릅니다: ${JSON.stringify(window)}`, windows };
    }
    const minutes = window.windowDurationMins;
    const rule = rules[String(minutes)];
    if (!rule) return { status: "error", planType, reason: `설정 파일에 요금제 ${planType}의 ${minutes}분 창 기준값이 없습니다`, windows };
    const remaining = 100 - window.usedPercent;
    const required = requiredRemaining(rule, phase, tasks);
    windows.push({ minutes, used: window.usedPercent, remaining, required, resetsAt: window.resetsAt ?? null, ok: remaining >= required });
  }
  if (windows.length === 0) return { status: "error", planType, reason: "한도 창 정보가 없습니다", windows };
  const short = windows.filter((window) => !window.ok);
  if (short.length === 0) return { status: "ok", planType, reason: "한도 충분", windows };
  return {
    status: "short",
    planType,
    reason: short
      .map((window) => `${window.minutes}분 창 남은 ${window.remaining}% < 기준 ${window.required}% (풀리는 시각 ${formatTime(window.resetsAt)})`)
      .join("; "),
    windows
  };
}

export function formatLimitLines(evaluation) {
  return [
    `codex-run limits status=${evaluation.status} plan=${evaluation.planType ?? "-"} reason=${evaluation.reason}`,
    ...evaluation.windows.map(
      (window) =>
        `window=${window.minutes}m used=${window.used}% remaining=${window.remaining}% required=${window.required}% resets=${formatTime(window.resetsAt)}`
    )
  ];
}
