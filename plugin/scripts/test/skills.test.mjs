import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultPaths } from "../lib/pins.mjs";
import { REPORT_FIELDS } from "../lib/report.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const skillsDir = path.join(pluginRoot, "skills");
const read = (...parts) => fs.readFileSync(path.join(skillsDir, ...parts), "utf8");

const SKILLS = {
  "codex-planning": ["plan-prompt.md", "fix-prompt.md", "handoff-prompt.md", "plan-review-additions.md"],
  "codex-execution": ["implement-prompt.md", "fix-prompt.md", "handoff-prompt.md", "final-fix-prompt.md", "review-additions.md"]
};

const CODEX_PROMPTS = {
  "codex-planning": ["plan-prompt.md", "fix-prompt.md", "handoff-prompt.md"],
  "codex-execution": ["implement-prompt.md", "fix-prompt.md", "handoff-prompt.md", "final-fix-prompt.md"]
};

const SUPERPOWERS_FILES = [
  "skills/subagent-driven-development/scripts/sdd-workspace",
  "skills/subagent-driven-development/scripts/task-brief",
  "skills/subagent-driven-development/scripts/review-package",
  "skills/subagent-driven-development/task-reviewer-prompt.md",
  "skills/subagent-driven-development/re-review-prompt.md",
  "skills/writing-plans/plan-document-reviewer-prompt.md",
  "skills/requesting-code-review/code-reviewer.md"
];

test("스킬마다 이름이 폴더 이름과 같고 설명이 있다", () => {
  for (const name of Object.keys(SKILLS)) {
    const front = /^---\r?\nname: (.+)\r?\ndescription: (.+)\r?\n---/.exec(read(name, "SKILL.md"));
    assert.ok(front, `${name}: frontmatter가 없음`);
    assert.equal(front[1].trim(), name);
    assert.ok(front[2].trim().length > 20, `${name}: 설명이 너무 짧음`);
  }
});

test("스킬이 쓰는 틀 파일이 모두 있고 SKILL.md에 이름이 나온다", () => {
  for (const [name, files] of Object.entries(SKILLS)) {
    const skill = read(name, "SKILL.md");
    for (const file of files) {
      assert.ok(fs.existsSync(path.join(skillsDir, name, file)), `${name}/${file}가 없음`);
      assert.ok(skill.includes(file), `${name}/SKILL.md가 ${file}를 언급하지 않음`);
    }
  }
});

test("Codex 지시문 틀은 다섯 보고 줄과 커밋 금지 규칙을 담는다", () => {
  for (const [name, files] of Object.entries(CODEX_PROMPTS)) {
    for (const file of files) {
      const text = read(name, file);
      for (const field of REPORT_FIELDS) assert.match(text, new RegExp(`^${field}: `, "m"), `${name}/${file}: ${field} 줄이 없음`);
      assert.match(text, /Do not commit/, `${name}/${file}: 커밋 금지 규칙이 없음`);
    }
  }
});

test("틀의 자리표시자는 모두 SKILL.md의 자리표시자 표에 있다", () => {
  for (const [name, files] of Object.entries(SKILLS)) {
    const skill = read(name, "SKILL.md");
    for (const file of files) {
      for (const [, key] of read(name, file).matchAll(/\{\{([A-Z_]+)\}\}/g)) {
        assert.ok(skill.includes(`{{${key}}}`), `${name}/${file}: {{${key}}}가 SKILL.md에 없음`);
      }
    }
  }
});

test("고정된 Superpowers 6.4.1에 스킬이 참조하는 파일이 모두 있다", () => {
  const root = defaultPaths().superpowersRoot;
  for (const file of SUPERPOWERS_FILES) assert.ok(fs.existsSync(path.join(root, file)), `${file}가 없음`);
});

test("실행 스킬은 작업 스크립트, 한도 확인, 멈춤과 재개, 사람 확인 규칙을 담는다", () => {
  const skill = read("codex-execution", "SKILL.md");
  for (const phrase of ["codex-task.mjs", "limits --cwd <저장소> --phase execute", "멈춤:", "이어서 진행", "사람 확인", "Final review:", "Final re-review:", "Usage log:", "Broker: closed", "[개발 중 · 큰 문제]", "보정 모듈 없이", "같은 역할과 같은 라운드", "No new commits", "묻지 않고 작업 브랜치", "측정: 예", "재개 승인", "짧은 진행 알림도", "<진행 기록 폴더>/reports/"]) {
    assert.ok(skill.includes(phrase), phrase);
  }
});

test("실행 스킬은 최종 수정 뒤 HEAD에서 마스터 테스트를 다시 돌리고, 재개 기록에 결과와 대상 커밋을 남긴다", () => {
  const skill = read("codex-execution", "SKILL.md");
  const finish = skill.slice(skill.indexOf("## 마무리"), skill.indexOf("## 하지 않는 것"));
  for (const phrase of [
    "Master test: <통과 수>/<전체 수> 통과 — target <HEAD 7자리>",
    "Final review: <승인 | 수정 필요> — target <HEAD 7자리>",
    "Final re-review: <결과> — target <HEAD 7자리>",
    "수정 뒤 HEAD에서 1번의 마스터 테스트를 다시 돌린다"
  ]) {
    assert.ok(finish.includes(phrase), phrase);
  }
  // 수정 뒤 마스터 테스트는 재검수 뒤, 최종 보고 전에 온다.
  assert.ok(finish.indexOf("수정 뒤 HEAD에서 1번의 마스터 테스트") > finish.indexOf("Final re-review:"));
  assert.ok(finish.indexOf("수정 뒤 HEAD에서 1번의 마스터 테스트") < finish.indexOf("**최종 보고:**"));
  const resume = skill.slice(skill.indexOf("## 이어서 진행"), skill.indexOf("## 작업마다"));
  for (const phrase of ["결과와 target", "`Final review: 수정 필요`인데 `Final fix:` 줄이 없으면", "지금 HEAD를 target으로 한 `Master test:` 줄이 없으면"]) {
    assert.ok(resume.includes(phrase), phrase);
  }
});

test("계획 지시 틀은 명세 머리말 줄을 정하고, 계획 검수는 그 줄을 확인한다", () => {
  assert.ok(read("codex-planning", "plan-prompt.md").includes("**Spec:** `{{SPEC_PATH}}`"));
  assert.match(read("codex-planning", "plan-review-additions.md"), /\*\*Spec:\*\* `<spec path>`/);
});

test("실행 스킬의 병합은 사용자 승인 뒤 로컬로만 하고 push는 하지 않는다", () => {
  const skill = read("codex-execution", "SKILL.md");
  assert.ok(skill.includes("main 병합은 사용자 승인 뒤 로컬로 한다"));
  assert.ok(skill.includes("push와 PR은 하지 않는다"));
});

test("계획 스킬은 한도 확인, 계획 검토 요청 줄, 멈춤과 재개 규칙을 담는다", () => {
  const skill = read("codex-planning", "SKILL.md");
  for (const phrase of ["limits --cwd <저장소> --phase plan", "계획 검토: 요청", "멈춤:", "이어서 진행", "Plan: committed", "Plan review:", "[기획 · 큰 문제]", "묻지 않고 작업 브랜치", "측정: 예", "재개 승인", "짧은 진행 알림도", "<진행 기록 폴더>/reports/"]) {
    assert.ok(skill.includes(phrase), phrase);
  }
});

test("지시문 틀에는 래퍼가 붙이는 공통 규칙을 넣지 않는다", () => {
  for (const [name, files] of Object.entries(CODEX_PROMPTS)) {
    for (const file of files) assert.doesNotMatch(read(name, file), /Workflow rules \(always apply\)/, `${name}/${file}`);
  }
});
