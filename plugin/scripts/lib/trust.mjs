// 사용자 Codex 설정의 신뢰 목록에서 워크플로우가 만든 임시 저장소 항목을 찾는다. 읽기만 한다.
// 사용자 Codex 설정 파일(~/.codex/config.toml)은 사용자 승인 없이 고치지 않는다(명세 3.4절).
import path from "node:path";

const win = path.win32;

export function findWorkflowTrustEntries(projects, tmpDir, exists) {
  const root = `${win.resolve(tmpDir).toLowerCase()}\\`;
  return Object.keys(projects ?? {})
    .filter((key) => {
      const full = win.resolve(key).toLowerCase();
      if (!full.startsWith(root)) return false;
      const first = full.slice(root.length).split("\\")[0];
      return first.startsWith("llm-workflow-");
    })
    .sort()
    .map((key) => ({ path: key, exists: Boolean(exists(key)), header: `[projects.'${key}']` }));
}

export function formatTrustReport(entries) {
  return [
    `codex-run trust-report entries=${entries.length}`,
    ...entries.map((entry) => `trust exists=${entry.exists ? "yes" : "no"} path=${entry.path} header=${entry.header}`),
    "위 항목을 사용자 Codex 설정(~/.codex/config.toml)에서 지우는 것은 사용자 승인을 받은 뒤에만 한다. 지우기 전에 설정 파일을 백업한다."
  ];
}
