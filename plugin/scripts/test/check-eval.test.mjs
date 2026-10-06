import test from "node:test";
import assert from "node:assert/strict";
import { trailerModel, evaluateBoundary } from "../lib/check-eval.mjs";

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

test("점검 출력을 읽을 수 없으면 실패다", () => {
  assert.equal(evaluateBoundary("none", { outsideFileExists: false, gitFileExists: false }).pass, false);
  assert.equal(evaluateBoundary(undefined, { outsideFileExists: false, gitFileExists: false }).pass, false);
});
