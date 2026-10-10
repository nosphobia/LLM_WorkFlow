import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  fillCurly,
  fillSquare,
  leftoverCurly,
  planTaskName,
  planSpecPath,
  planSection,
  extractTemplatePrompt,
  wrotePath,
  fromBashPath,
  toRepoRelative,
  RUN_ROLES,
  templateFor,
  runFiles,
  wrapperCall
} from "../lib/task-prompt.mjs";
import { defaultPaths } from "../lib/pins.mjs";

const PLAN = [
  "# Demo Implementation Plan",
  "",
  "**Spec:** `docs/specs/demo.md`",
  "",
  "## Global Constraints",
  "",
  "- Node only.",
  "- Korean messages.",
  "",
  "## Review Focus",
  "",
  "1. x",
  "",
  "### Task 2: Add farewell",
  "",
  "- [ ] Step 1"
].join("\n");

test("자리표시자를 채우고 남은 것을 찾는다", () => {
  assert.equal(fillCurly("A {{X}} {{Y}}", { X: 1 }), "A 1 {{Y}}");
  assert.deepEqual(leftoverCurly("A {{Y}} {{Y}} {{Z}}"), ["Y", "Z"]);
  assert.equal(fillSquare("B [BASE_SHA]..[HEAD_SHA] [KEEP]", { BASE_SHA: "a", HEAD_SHA: "b" }), "B a..b [KEEP]");
  assert.equal(fillSquare("[FINDINGS]", { FINDINGS: "see [BASE_SHA]" }), "see [BASE_SHA]");
});

test("계획에서 작업 이름, 명세 경로, 절 내용을 뽑는다", () => {
  assert.equal(planTaskName(PLAN, 2), "Add farewell");
  assert.equal(planTaskName(PLAN, 3), null);
  assert.equal(planSpecPath(PLAN), "docs/specs/demo.md");
  assert.equal(planSection(PLAN, "Global Constraints"), "- Node only.\n- Korean messages.");
  assert.equal(planSection(PLAN, "Missing"), null);
});

test("Superpowers 검수 틀에서 실제 지시문만 꺼낸다", () => {
  const sp = path.join(defaultPaths().superpowersRoot, "skills");
  for (const file of ["subagent-driven-development/task-reviewer-prompt.md", "subagent-driven-development/re-review-prompt.md", "requesting-code-review/code-reviewer.md"]) {
    const prompt = extractTemplatePrompt(fs.readFileSync(path.join(sp, file), "utf8"));
    assert.ok(prompt && prompt.length > 200, file);
    assert.doesNotMatch(prompt, /^Subagent \(general-purpose\)/, file);
    assert.doesNotMatch(prompt, /^\s*prompt: \|/m, file);
    assert.match(prompt, /\[HEAD_SHA\]/, file);
  }
  assert.equal(extractTemplatePrompt("no fence"), null);
});

test("스크립트 출력과 경로를 바꾼다", () => {
  assert.equal(wrotePath("wrote /d/w/.superpowers/sdd/p/task-1-brief.md: 40 lines\n"), "/d/w/.superpowers/sdd/p/task-1-brief.md");
  assert.equal(wrotePath("nothing"), null);
  assert.equal(fromBashPath("/d/Work/repo/x.md"), "D:\\Work\\repo\\x.md");
  assert.equal(fromBashPath("C:\\already\\windows"), "C:\\already\\windows");
  assert.equal(toRepoRelative("C:\\r", "C:\\r\\.superpowers\\sdd\\p\\a.md"), ".superpowers/sdd/p/a.md");
});

test("역할별 틀, 파일 이름, 래퍼 호출 방식", () => {
  assert.deepEqual(RUN_ROLES, ["implement", "fix", "handoff", "final-fix"]);
  assert.equal(templateFor("handoff"), "handoff-prompt.md");
  assert.deepEqual(runFiles({ role: "implement", task: "3" }), { prompt: "task-3-codex-prompt.md", report: "task-3-report.md" });
  assert.deepEqual(runFiles({ role: "fix", task: "3", round: 2 }), { prompt: "task-3-fix-r2-codex-prompt.md", report: "task-3-report.md" });
  assert.deepEqual(runFiles({ role: "final-fix" }), { prompt: "final-fix-codex-prompt.md", report: "final-fix-report.md" });
  assert.deepEqual(wrapperCall({ role: "implement" }), { action: "start", role: "implement", round: null });
  assert.deepEqual(wrapperCall({ role: "implement", thread: "t" }), { action: "resume", role: "implement", round: null });
  assert.deepEqual(wrapperCall({ role: "fix", thread: "t", round: 2 }), { action: "resume", role: "fix", round: 2 });
  assert.deepEqual(wrapperCall({ role: "handoff", round: 4 }), { action: "start", role: "fix", round: 4 });
  assert.deepEqual(wrapperCall({ role: "final-fix" }), { action: "start", role: "final-fix", round: null });
});
