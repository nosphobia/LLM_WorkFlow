// Codex 세션 기록(~/.codex/sessions/**/rollout-*-<대화 ID>.jsonl)에서 한 차례의 모델, 토큰, 한도 사용률, 오류를 읽는다.
import fs from "node:fs";
import path from "node:path";

export function findRolloutFile(sessionsDir, threadId) {
  if (!threadId || !fs.existsSync(sessionsDir)) return null;
  const suffix = `-${threadId}.jsonl`;
  const found = fs.readdirSync(sessionsDir, { recursive: true }).find((name) => String(name).endsWith(suffix));
  return found ? path.join(sessionsDir, String(found)) : null;
}

export function summarizeTurn(text, turnId) {
  const summary = {
    found: false,
    completed: false,
    model: null,
    effort: null,
    tokens: null,
    rateLimitsStart: null,
    rateLimitsEnd: null,
    limitReached: false,
    error: null
  };
  let inTurn = false;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      continue;
    }
    const payload = event.payload ?? {};
    if (event.type === "turn_context" && payload.turn_id === turnId) {
      summary.found = true;
      summary.model = payload.model ?? null;
      summary.effort = payload.effort ?? null;
    } else if (event.type === "token_usage_record" && payload.turn_id === turnId && payload.turn_token_usage) {
      summary.tokens = payload.turn_token_usage;
    } else if (event.type === "event_msg" && payload.type === "task_started" && payload.turn_id === turnId) {
      summary.found = true;
      inTurn = true;
    } else if (event.type === "event_msg" && payload.type === "task_complete" && payload.turn_id === turnId) {
      summary.completed = true;
      inTurn = false;
      if (payload.error) summary.error = { message: String(payload.error.message ?? ""), info: payload.error.codex_error_info ?? null };
    } else if (inTurn && event.type === "event_msg" && payload.type === "token_count" && payload.rate_limits) {
      summary.rateLimitsStart ??= payload.rate_limits;
      summary.rateLimitsEnd = payload.rate_limits;
      if (payload.rate_limits.rate_limit_reached_type) summary.limitReached = true;
    }
  }
  return summary;
}

export function weeklyPercent(rateLimits) {
  if (!rateLimits) return null;
  const weekly = [rateLimits.primary, rateLimits.secondary].find((window) => window?.window_minutes === 10080);
  return weekly ? weekly.used_percent : null;
}

export function isLimitError(error) {
  if (!error) return false;
  return /usage[ _-]?limit|rate[ _-]?limit|quota/i.test(`${error.message ?? ""} ${error.info ?? ""} ${error.codexErrorInfo ?? ""}`);
}
