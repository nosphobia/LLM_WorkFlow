// codex-task.mjs의 순수 함수: 계획에서 값 뽑기, 틀 채우기, Superpowers 스크립트 출력 읽기, 파일 이름 정하기.
import os from "node:os";
import path from "node:path";

export const fillCurly = (text, values) => text.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => (key in values ? String(values[key]) : match));
export const fillSquare = (text, values) => text.replace(/\[([A-Z_]+)\]/g, (match, key) => (key in values ? String(values[key]) : match));
export const leftoverCurly = (text) => [...new Set([...text.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((match) => match[1]))];

export function planTaskName(plan, n) {
  const match = new RegExp(`^#{2,4} Task ${n}: (.+)$`, "m").exec(plan);
  return match ? match[1].trim() : null;
}

export function planSpecPath(plan) {
  const match = /^\*\*Spec:\*\*\s*`?([^`\n]+?)`?\s*$/m.exec(plan);
  return match ? match[1].trim() : null;
}

// "## 제목" 아래부터 다음 "## " 제목 전까지(### 은 포함)를 돌려준다.
export function planSection(plan, title) {
  const lines = plan.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

// Superpowers 검수 틀은 첫 코드 블록의 "prompt: |" 아래 들여쓴 본문이 실제 지시문이다.
export function extractTemplatePrompt(markdown) {
  const block = /```[^\n]*\r?\n([\s\S]*?)\r?\n```/.exec(markdown)?.[1];
  if (!block) return null;
  const lines = block.split(/\r?\n/);
  const at = lines.findIndex((line) => /^\s*prompt:\s*\|\s*$/.test(line));
  if (at < 0) return block;
  const body = lines.slice(at + 1);
  const indent = Math.min(...body.filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length));
  return body.map((line) => line.slice(indent)).join("\n").trim();
}

export function wrotePath(output) {
  const match = /^wrote (.+?): /m.exec(output ?? "");
  return match ? match[1].trim() : null;
}

// Git Bash가 출력한 /d/Work/... 를 D:\Work\... 로 바꾼다. 이미 Windows 경로면 그대로 둔다.
export function fromBashPath(value) {
  // Git Bash는 /tmp를 사용자 임시 폴더에 연결하므로 드라이브 글자 규칙으로는 바꿀 수 없다.
  const tmp = /^\/tmp(?:\/(.*))?$/.exec(value ?? "");
  if (tmp) return path.win32.join(os.tmpdir(), (tmp[1] ?? "").replace(/\//g, "\\"));
  const match = /^\/([a-zA-Z])\/(.*)$/.exec(value ?? "");
  return match ? `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, "\\")}` : value;
}

export const toRepoRelative = (repoDir, file) => path.win32.relative(repoDir, path.win32.resolve(repoDir, file)).split("\\").join("/");

const ROLE_TEMPLATES = { implement: "implement-prompt.md", fix: "fix-prompt.md", handoff: "handoff-prompt.md", "final-fix": "final-fix-prompt.md" };
export const RUN_ROLES = Object.freeze(Object.keys(ROLE_TEMPLATES));
export const templateFor = (role) => ROLE_TEMPLATES[role];

export function runFiles({ role, task, round }) {
  if (role === "final-fix") return { prompt: "final-fix-codex-prompt.md", report: "final-fix-report.md" };
  const suffix = role === "implement" ? "" : `-${role}-r${round ?? 0}`;
  return { prompt: `task-${task}${suffix}-codex-prompt.md`, report: `task-${task}-report.md` };
}

export function wrapperCall({ role, thread, round }) {
  return {
    action: thread ? "resume" : "start",
    role: role === "handoff" ? "fix" : role,
    round: role === "implement" || role === "final-fix" ? null : round ?? 0
  };
}
