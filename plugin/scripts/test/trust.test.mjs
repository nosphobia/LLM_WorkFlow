import test from "node:test";
import assert from "node:assert/strict";
import { findWorkflowTrustEntries, formatTrustReport } from "../lib/trust.mjs";

const projects = {
  "c:\\users\\me\\appdata\\local\\temp\\llm-workflow-check-abc\\repo": { trust_level: "trusted" },
  "c:\\users\\me\\appdata\\local\\temp\\other\\repo": { trust_level: "trusted" },
  "e:\\nosbase": { trust_level: "trusted" },
  "C:\\Users\\me\\AppData\\Local\\Temp\\llm-workflow-replay-x\\repo": { trust_level: "trusted" },
  "d:\\work\\llm_project\\usage-log-summary-codex": { trust_level: "trusted" }
};

test("임시 폴더 아래 워크플로우 항목만 고른다", () => {
  const exists = (dir) => dir.includes("check-abc");
  const entries = findWorkflowTrustEntries(projects, "C:\\Users\\me\\AppData\\Local\\Temp", exists);
  assert.deepEqual(entries, [
    { path: "C:\\Users\\me\\AppData\\Local\\Temp\\llm-workflow-replay-x\\repo", exists: false, header: "[projects.'C:\\Users\\me\\AppData\\Local\\Temp\\llm-workflow-replay-x\\repo']" },
    { path: "c:\\users\\me\\appdata\\local\\temp\\llm-workflow-check-abc\\repo", exists: true, header: "[projects.'c:\\users\\me\\appdata\\local\\temp\\llm-workflow-check-abc\\repo']" }
  ]);
  assert.deepEqual(findWorkflowTrustEntries(undefined, "C:\\Temp", () => true), []);
});

test("보고 줄은 항목마다 한 줄과 승인 안내를 담는다", () => {
  const lines = formatTrustReport([{ path: "C:\\T\\llm-workflow-a\\repo", exists: true, header: "[projects.'C:\\T\\llm-workflow-a\\repo']" }]);
  assert.match(lines[0], /^codex-run trust-report entries=1$/);
  assert.match(lines[1], /^trust exists=yes path=C:\\T\\llm-workflow-a\\repo header=\[projects\.'C:\\T\\llm-workflow-a\\repo'\]$/);
  assert.match(lines.at(-1), /사용자 승인/);
  assert.deepEqual(formatTrustReport([]).slice(0, 1), ["codex-run trust-report entries=0"]);
});
