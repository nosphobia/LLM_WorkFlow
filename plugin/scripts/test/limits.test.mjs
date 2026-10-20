import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLimits, formatLimitLines, pickSnapshot } from "../lib/limits.mjs";

const SETTINGS = {
  protectedPaths: [],
  limits: {
    plus: {
      300: { plan: 50, executeBase: 0, executePerTask: 18, call: 30 },
      10080: { plan: 10, executeBase: 7, executePerTask: 3, call: 5 }
    },
    prolite: { 10080: { plan: 5, executeBase: 5, executePerTask: 2, call: 5 } }
  }
};

const plus = (fiveHourUsed, weeklyUsed) => ({
  rateLimits: {
    planType: "plus",
    primary: { usedPercent: fiveHourUsed, windowDurationMins: 300, resetsAt: 1791600000 },
    secondary: { usedPercent: weeklyUsed, windowDurationMins: 10080, resetsAt: 1792000000 }
  }
});

const prolite = (weeklyUsed) => ({
  rateLimits: { planType: "prolite", primary: null, secondary: null },
  rateLimitsByLimitId: {
    codex: { planType: "prolite", primary: { usedPercent: weeklyUsed, windowDurationMins: 10080, resetsAt: 1792200000 }, secondary: null }
  }
});

test("codex 한도가 따로 있으면 그것을 쓴다", () => {
  assert.equal(pickSnapshot(prolite(0)).planType, "prolite");
  assert.equal(pickSnapshot(plus(1, 1)).planType, "plus");
  assert.equal(pickSnapshot({}), null);
});

test("남은 양이 기준 이상이면 ok", () => {
  const result = evaluateLimits(prolite(0), SETTINGS, { phase: "call" });
  assert.equal(result.status, "ok");
  assert.equal(result.planType, "prolite");
  assert.deepEqual(result.windows.map(({ minutes, remaining, required }) => ({ minutes, remaining, required })), [{ minutes: 10080, remaining: 100, required: 5 }]);
});

test("한 창이라도 기준 미만이면 short, 이유에 풀리는 시각이 있다", () => {
  const result = evaluateLimits(plus(60, 20), SETTINGS, { phase: "plan" });
  assert.equal(result.status, "short");
  assert.match(result.reason, /300분 창 남은 40% < 기준 50% \(풀리는 시각 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)/);
  assert.doesNotMatch(result.reason, /10080분/);
});

test("실행 전 기준은 작업 수에 따라 커진다", () => {
  assert.equal(evaluateLimits(plus(60, 20), SETTINGS, { phase: "execute", tasks: 2 }).status, "ok");
  const short = evaluateLimits(plus(60, 20), SETTINGS, { phase: "execute", tasks: 3 });
  assert.equal(short.status, "short");
  assert.match(short.reason, /기준 54%/);
});

test("있는 창의 사용률이 0~100의 숫자가 아니면 다른 창이 괜찮아도 error", () => {
  const twoWindows = (primary) => ({ rateLimits: { planType: "plus", primary, secondary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: null } } });
  for (const usedPercent of ["100", -5, 101, Number.NaN, null]) {
    const result = evaluateLimits(twoWindows({ usedPercent, windowDurationMins: 300, resetsAt: null }), SETTINGS, { phase: "call" });
    assert.equal(result.status, "error", String(usedPercent));
    assert.match(result.reason, /한도 창 형식이 예상과 다릅니다/);
  }
  const noMinutes = evaluateLimits(twoWindows({ usedPercent: 10, resetsAt: null }), SETTINGS, { phase: "call" });
  assert.equal(noMinutes.status, "error");
  // 창 자체가 없으면(null) 그 창은 없는 것으로 본다.
  assert.equal(evaluateLimits(twoWindows(null), SETTINGS, { phase: "call" }).status, "ok");
});

test("설정에 없는 요금제나 창이면 error", () => {
  const team = { rateLimits: { planType: "team", primary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: null } } };
  const unknownPlan = evaluateLimits(team, SETTINGS, { phase: "call" });
  assert.equal(unknownPlan.status, "error");
  assert.match(unknownPlan.reason, /요금제 team/);
  assert.match(unknownPlan.reason, /workflow-settings\.json/);
  const extraWindow = { rateLimits: { planType: "prolite", primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: null } } };
  assert.match(evaluateLimits(extraWindow, SETTINGS, { phase: "call" }).reason, /300분 창/);
  assert.equal(evaluateLimits({}, SETTINGS, { phase: "call" }).status, "error");
  const noWindows = { rateLimits: { planType: "prolite", primary: null, secondary: null } };
  assert.match(evaluateLimits(noWindows, SETTINGS, { phase: "call" }).reason, /한도 창 정보가 없습니다/);
});

test("출력 줄에 상태와 창별 값이 있다", () => {
  const lines = formatLimitLines(evaluateLimits(plus(60, 20), SETTINGS, { phase: "plan" }));
  assert.match(lines[0], /^codex-run limits status=short plan=plus reason=/);
  assert.match(lines[1], /^window=300m used=60% remaining=40% required=50% resets=\d{4}-/);
  assert.match(lines[2], /^window=10080m used=20% remaining=80% required=10% resets=/);
});
