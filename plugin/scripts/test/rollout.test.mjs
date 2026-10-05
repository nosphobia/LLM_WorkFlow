import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findRolloutFile, summarizeTurn, weeklyPercent, isLimitError } from "../lib/rollout.mjs";

const line = (value) => JSON.stringify(value);
const limits = (weekly, reached = null) => ({
  primary: { window_minutes: 300, used_percent: 50 },
  secondary: { window_minutes: 10080, used_percent: weekly },
  rate_limit_reached_type: reached
});

const ROLLOUT = [
  line({ type: "session_meta", payload: { id: "thread-1" } }),
  line({ type: "event_msg", payload: { type: "task_started", turn_id: "turn-1" } }),
  line({ type: "turn_context", payload: { turn_id: "turn-1", model: "gpt-old", effort: "high" } }),
  line({ type: "token_usage_record", payload: { turn_id: "turn-1", turn_token_usage: { total_tokens: 100 } } }),
  line({ type: "event_msg", payload: { type: "token_count", info: {}, rate_limits: limits(10) } }),
  line({ type: "event_msg", payload: { type: "task_complete", turn_id: "turn-1", last_agent_message: "ok" } }),
  line({ type: "event_msg", payload: { type: "task_started", turn_id: "turn-2" } }),
  line({ type: "turn_context", payload: { turn_id: "turn-2", model: "gpt-5.6-sol", effort: "xhigh" } }),
  line({ type: "token_usage_record", payload: { turn_id: "turn-2", turn_token_usage: { input_tokens: 30, total_tokens: 40 } } }),
  line({ type: "event_msg", payload: { type: "token_count", info: {}, rate_limits: limits(11) } }),
  "깨진 줄",
  line({ type: "token_usage_record", payload: { turn_id: "turn-2", turn_token_usage: { input_tokens: 60, total_tokens: 80 } } }),
  line({ type: "event_msg", payload: { type: "token_count", info: {}, rate_limits: limits(12) } }),
  line({ type: "event_msg", payload: { type: "task_complete", turn_id: "turn-2", last_agent_message: "done" } })
].join("\n");

test("여러 차례가 쌓인 기록에서 지정한 차례만 읽는다", () => {
  const summary = summarizeTurn(ROLLOUT, "turn-2");
  assert.equal(summary.found, true);
  assert.equal(summary.completed, true);
  assert.equal(summary.model, "gpt-5.6-sol");
  assert.equal(summary.effort, "xhigh");
  assert.deepEqual(summary.tokens, { input_tokens: 60, total_tokens: 80 });
  assert.equal(weeklyPercent(summary.rateLimitsStart), 11);
  assert.equal(weeklyPercent(summary.rateLimitsEnd), 12);
  assert.equal(summary.limitReached, false);
  assert.equal(summary.error, null);

  const first = summarizeTurn(ROLLOUT, "turn-1");
  assert.equal(first.tokens.total_tokens, 100);
  assert.equal(weeklyPercent(first.rateLimitsEnd), 10);
});

test("없는 차례는 found가 false다", () => {
  const summary = summarizeTurn(ROLLOUT, "turn-9");
  assert.equal(summary.found, false);
  assert.equal(summary.tokens, null);
});

test("차례 안의 한도 도달과 오류를 읽는다", () => {
  const text = [
    line({ type: "event_msg", payload: { type: "task_started", turn_id: "turn-1" } }),
    line({ type: "event_msg", payload: { type: "token_count", info: {}, rate_limits: limits(100, "weekly") } }),
    line({
      type: "event_msg",
      payload: {
        type: "task_complete",
        turn_id: "turn-1",
        last_agent_message: null,
        error: { message: "You've hit your usage limit.", codex_error_info: "usage_limit_exceeded" }
      }
    })
  ].join("\n");
  const summary = summarizeTurn(text, "turn-1");
  assert.equal(summary.limitReached, true);
  assert.deepEqual(summary.error, { message: "You've hit your usage limit.", info: "usage_limit_exceeded" });
  assert.equal(isLimitError(summary.error), true);
});

test("주간 한도 창(10080분)을 primary나 secondary에서 찾는다", () => {
  assert.equal(weeklyPercent({ primary: { window_minutes: 10080, used_percent: 7 } }), 7);
  assert.equal(weeklyPercent({ primary: { window_minutes: 300, used_percent: 7 } }), null);
  assert.equal(weeklyPercent(null), null);
});

test("한도 오류를 알아본다", () => {
  assert.equal(isLimitError({ message: "rate limit exceeded" }), true);
  assert.equal(isLimitError({ message: "x", info: "usage_limit_exceeded" }), true);
  assert.equal(isLimitError({ message: "The 'no-such-model-xyz' model is not supported" }), false);
  assert.equal(isLimitError(null), false);
});

test("라이브러리 오류의 codexErrorInfo(camelCase)로도 한도 오류를 알아본다", () => {
  assert.equal(isLimitError({ message: "x", codexErrorInfo: "usageLimitExceeded" }), true);
  assert.equal(isLimitError({ message: "x", codexErrorInfo: "rateLimitExceeded" }), true);
  assert.equal(isLimitError({ message: "x", codexErrorInfo: "other" }), false);
});

test("대화 ID로 세션 기록 파일을 찾는다", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-workflow-sessions-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const nested = path.join(dir, "2026", "10", "05");
  fs.mkdirSync(nested, { recursive: true });
  const file = path.join(nested, "rollout-2026-10-05T20-02-05-thread-abc.jsonl");
  fs.writeFileSync(file, "");
  assert.equal(findRolloutFile(dir, "thread-abc"), file);
  assert.equal(findRolloutFile(dir, "thread-zzz"), null);
  assert.equal(findRolloutFile(path.join(dir, "없음"), "thread-abc"), null);
});
