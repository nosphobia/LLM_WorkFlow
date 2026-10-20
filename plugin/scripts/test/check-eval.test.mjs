import test from "node:test";
import assert from "node:assert/strict";
import { trailerModel, evaluateBoundary, evaluatePinnedTurns, isRateLimited } from "../lib/check-eval.mjs";

const rollout = ({ model = "gpt-5.6-sol", effort = "ultra", memory = false, turns = 1 } = {}) =>
  [
    { type: "session_meta", payload: { id: "t1" } },
    {
      type: "response_item",
      payload: { type: "message", role: "developer", content: [{ type: "input_text", text: memory ? "## Memory\r\n\r\nYou have access to a memory folder with guidance from prior runs." : "## Permissions\nsandbox" }] }
    },
    ...Array.from({ length: turns }, (_, i) => ({ type: "turn_context", payload: { turn_id: `u${i}`, model, effort } }))
  ]
    .map((line) => JSON.stringify(line))
    .join("\n");

test("세션 기록의 모든 차례가 설정한 모델·추론 강도이고 메모리 안내가 없으면 통과다", () => {
  const verdict = evaluatePinnedTurns(rollout({ turns: 2 }), { model: "gpt-5.6-sol", effort: "ultra" });
  assert.equal(verdict.pass, true);
  assert.equal(verdict.detail, "차례 2개 모두 모델=gpt-5.6-sol 추론 강도=ultra, 메모리 안내 없음");
});

test("메모리 안내가 있거나 모델·추론 강도가 다르거나 차례 정보가 없으면 실패다", () => {
  const want = { model: "gpt-5.6-sol", effort: "ultra" };
  assert.match(evaluatePinnedTurns(rollout({ memory: true }), want).detail, /메모리 안내가 들어 있음/);
  assert.equal(evaluatePinnedTurns(rollout({ memory: true }), want).pass, false);
  assert.match(evaluatePinnedTurns(rollout({ model: "gpt-6-astra" }), want).detail, /모델=gpt-6-astra/);
  assert.match(evaluatePinnedTurns(rollout({ effort: "high" }), want).detail, /추론 강도=high/);
  assert.match(evaluatePinnedTurns(rollout({ turns: 0 }), want).detail, /차례 정보가 없습니다/);
  assert.equal(evaluatePinnedTurns(null, want).pass, false);
});

const DENIED = '{"outside_write": "denied", "git_write": "denied", "network": "denied"}';

test("커밋 메시지의 Codex 서명 줄에서 모델명을 읽는다", () => {
  assert.equal(trailerModel("feat: 시험\n\nCo-Authored-By: Codex gpt-5.6-sol <noreply@openai.com>\n"), "gpt-5.6-sol");
  assert.equal(trailerModel("feat: 시험\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n"), null);
  assert.equal(trailerModel(""), null);
});

test("파일 경계가 거부되고 파일이 없으면 통과다", () => {
  const verdict = evaluateBoundary(DENIED, { outsideFileExists: false, gitFileExists: false });
  assert.equal(verdict.pass, true);
  assert.equal(verdict.networkAllowed, false);
  assert.match(verdict.detail, /네트워크: 거부됨$/);
  assert.equal(evaluateBoundary(`python boundary_probe.py -> ${DENIED}`, { outsideFileExists: false, gitFileExists: false }).pass, true);
});

test("네트워크만 허용돼도 통과하고, 알려진 한계로 기록한다", () => {
  const networkOnly = '{"outside_write": "denied", "git_write": "denied", "network": "allowed"}';
  const verdict = evaluateBoundary(networkOnly, { outsideFileExists: false, gitFileExists: false });
  assert.equal(verdict.pass, true);
  assert.equal(verdict.networkAllowed, true);
  assert.match(verdict.detail, /네트워크: 허용됨 \(알려진 한계: Windows unelevated 샌드박스\)$/);
});

test("저장소 밖 쓰기나 .git 쓰기가 허용되면 실패다", () => {
  const outside = '{"outside_write": "allowed", "git_write": "denied", "network": "allowed"}';
  const outsideVerdict = evaluateBoundary(outside, { outsideFileExists: false, gitFileExists: false });
  assert.equal(outsideVerdict.pass, false);
  assert.match(outsideVerdict.detail, /저장소 밖 쓰기/);

  const git = '{"outside_write": "denied", "git_write": "allowed", "network": "denied"}';
  const gitVerdict = evaluateBoundary(git, { outsideFileExists: false, gitFileExists: false });
  assert.equal(gitVerdict.pass, false);
  assert.match(gitVerdict.detail, /\.git/);
});

test("보고는 거부라도 파일이 실제로 생겼으면 실패다", () => {
  const verdict = evaluateBoundary(DENIED, { outsideFileExists: false, gitFileExists: true });
  assert.equal(verdict.pass, false);
  assert.match(verdict.detail, /\.git/);
});

test("거부(권한 오류)가 아닌 다른 오류는 거부로 보지 않고 확인 실패다", () => {
  const other = '{"outside_write": "error:FileNotFoundError", "git_write": "denied", "network": "denied"}';
  const verdict = evaluateBoundary(other, { outsideFileExists: false, gitFileExists: false });
  assert.equal(verdict.pass, false);
  assert.ok(verdict.detail.includes("저장소 밖 쓰기를 확인하지 못함 (error:FileNotFoundError)"), verdict.detail);
});

test("Codex 서버의 429 실패를 알아본다", () => {
  assert.equal(isRateLimited({ exitCode: 3, result: { reason: "Codex 호출 실패: exceeded retry limit, last status: 429 Too Many Requests" } }), true);
  assert.equal(isRateLimited({ exitCode: 3, result: { reason: "Codex 호출 실패: 제한 시간 0.5분 초과" } }), false);
  assert.equal(isRateLimited({ exitCode: 0, result: { reason: "Codex 보고: DONE" } }), false);
  assert.equal(isRateLimited({ exitCode: 3, result: null }), false);
});

test("점검 출력을 읽을 수 없으면 실패다", () => {
  assert.equal(evaluateBoundary("none", { outsideFileExists: false, gitFileExists: false }).pass, false);
  assert.equal(evaluateBoundary(undefined, { outsideFileExists: false, gitFileExists: false }).pass, false);
});

test("보정 모듈 폴더 쓰기 결과가 있으면 함께 판정한다", () => {
  const withShim = '{"outside_write": "denied", "git_write": "denied", "shim_write": "denied", "network": "denied"}';
  const ok = evaluateBoundary(withShim, { outsideFileExists: false, gitFileExists: false, shimFileExists: false });
  assert.equal(ok.pass, true);
  assert.match(ok.detail, /보정 모듈 폴더 쓰기도 거부됨/);
  const allowed = '{"outside_write": "denied", "git_write": "denied", "shim_write": "allowed", "network": "denied"}';
  const bad = evaluateBoundary(allowed, { outsideFileExists: false, gitFileExists: false });
  assert.equal(bad.pass, false);
  assert.match(bad.detail, /보정 모듈 폴더 쓰기가 허용됨/);
  assert.equal(evaluateBoundary(withShim, { outsideFileExists: false, gitFileExists: false, shimFileExists: true }).pass, false);
});
