// 토큰을 더하고, 진행 기록 폴더의 codex-calls.jsonl 합계를 낸다.
const TOKEN_FIELDS = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];

export function sumTokens(list) {
  const present = list.filter(Boolean);
  if (present.length === 0) return null;
  const total = {};
  for (const field of TOKEN_FIELDS) {
    total[field] = present.reduce((sum, tokens) => sum + (Number(tokens[field]) || 0), 0);
  }
  return total;
}

export function summarizeCalls(text) {
  const calls = text
    .split(/\r?\n/)
    .filter((raw) => raw.trim())
    .map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const byRole = {};
  for (const call of calls) {
    const role = call.role ?? "unknown";
    byRole[role] = (byRole[role] ?? 0) + 1;
  }
  return {
    calls: calls.length,
    byRole,
    failures: calls.filter((call) => call.exitCode !== 0).length,
    corrections: calls.reduce((sum, call) => sum + (Number(call.corrections) || 0), 0),
    durationSec: calls.reduce((sum, call) => sum + (Number(call.durationSec) || 0), 0),
    tokens: sumTokens(calls.map((call) => call.tokens)),
    weeklyStart: calls.find((call) => call.weeklyStart !== null && call.weeklyStart !== undefined)?.weeklyStart ?? null,
    weeklyEnd: [...calls].reverse().find((call) => call.weeklyEnd !== null && call.weeklyEnd !== undefined)?.weeklyEnd ?? null
  };
}
