import test from "node:test";
import assert from "node:assert/strict";
import { sumTokens, summarizeCalls } from "../lib/usage.mjs";

test("토큰을 항목별로 더하고, 기록이 없으면 null이다", () => {
  assert.deepEqual(sumTokens([{ input_tokens: 10, total_tokens: 12 }, null, { input_tokens: 5, cached_input_tokens: 4, total_tokens: 6 }]), {
    input_tokens: 15,
    cached_input_tokens: 4,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 18
  });
  assert.equal(sumTokens([null, undefined]), null);
});

test("호출 기록 합계를 낸다", () => {
  const lines = [
    { role: "plan", exitCode: 0, corrections: 0, durationSec: 100, tokens: { total_tokens: 1000 }, weeklyStart: 12, weeklyEnd: 13 },
    "깨진 줄",
    { role: "implement", exitCode: 0, corrections: 1, durationSec: 200, tokens: { total_tokens: 500 }, weeklyStart: 13, weeklyEnd: 15 },
    { role: "implement", exitCode: 3, corrections: 0, durationSec: 5, tokens: null, weeklyStart: null, weeklyEnd: null }
  ].map((value) => (typeof value === "string" ? value : JSON.stringify(value))).join("\n");
  const summary = summarizeCalls(`${lines}\n`);
  assert.equal(summary.calls, 3);
  assert.deepEqual(summary.byRole, { plan: 1, implement: 2 });
  assert.equal(summary.failures, 1);
  assert.equal(summary.corrections, 1);
  assert.equal(summary.durationSec, 305);
  assert.equal(summary.tokens.total_tokens, 1500);
  assert.equal(summary.weeklyStart, 12);
  assert.equal(summary.weeklyEnd, 15);
});
