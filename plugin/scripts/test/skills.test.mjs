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
