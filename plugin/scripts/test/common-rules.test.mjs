import test from "node:test";
import assert from "node:assert/strict";
import { buildCommonRules, withCommonRules } from "../lib/common-rules.mjs";

const PROTECTED = [".claude/", ".githooks/", "CLAUDE.md", ".codex/"];

test("공통 규칙은 하위 에이전트, 임시 폴더, 권한, 보호 경로, 프로세스를 다룬다", () => {
  const rules = buildCommonRules(PROTECTED);
  assert.match(rules, /^## Workflow rules \(always apply\)$/m);
  assert.match(rules, /Do not spawn sub-agents/);
  assert.match(rules, /Superpowers skill/);
  assert.match(rules, /default temporary directory \(TEMP\)/);
  assert.match(rules, /do not change ownership or permissions/);
  assert.match(rules, /do not retry the same action with a different command/);
  assert.match(rules, /\.claude\/, \.githooks\/, CLAUDE\.md, \.codex\//);
  assert.match(rules, /Do not terminate processes\./);
});

test("지시문 앞에 공통 규칙을 붙이고 원래 지시문은 그대로 둔다", () => {
  const prompt = "You are implementing Task 1.";
  const combined = withCommonRules(prompt, PROTECTED);
  assert.ok(combined.startsWith("## Workflow rules"));
  assert.ok(combined.endsWith(`\n\n${prompt}`));
});
