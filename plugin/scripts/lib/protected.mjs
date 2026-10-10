// Codex가 바꾼 파일 가운데 보호 경로에 걸리는 것을 찾는다.
// "이름/" 규칙은 어느 깊이의 그 폴더 아래든, 그 밖의 규칙은 어느 깊이의 같은 이름 파일이든 걸린다. 대소문자는 가리지 않는다(Windows).
import { normalizePath } from "./report.mjs";

export function findProtectedChanges(files, protectedPaths) {
  const rules = protectedPaths.map((rule) => normalizePath(rule).toLowerCase());
  const hits = new Set();
  for (const raw of files ?? []) {
    const file = normalizePath(String(raw));
    const lower = file.toLowerCase();
    const base = lower.split("/").pop();
    const hit = rules.some((rule) => (rule.endsWith("/") ? `/${lower}`.includes(`/${rule}`) : base === rule));
    if (hit) hits.add(file);
  }
  return [...hits].sort();
}
