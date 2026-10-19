// Codex가 바꾼 파일 가운데 보호 경로에 걸리는 것을 찾는다.
// "이름/" 규칙은 어느 깊이의 그 폴더 자체와 그 아래든, 그 밖의 규칙은 어느 깊이의 같은 이름 파일이든 걸린다. 대소문자는 가리지 않는다(Windows).
import fs from "node:fs";
import path from "node:path";
import { normalizePath } from "./report.mjs";
import { hashText } from "./project-config.mjs";

export function findProtectedChanges(files, protectedPaths) {
  const rules = protectedPaths.map((rule) => normalizePath(rule).toLowerCase());
  const hits = new Set();
  for (const raw of files ?? []) {
    const file = normalizePath(String(raw));
    const lower = file.toLowerCase();
    const base = lower.split("/").pop();
    const hit = rules.some((rule) => (rule.endsWith("/") ? `/${lower}/`.includes(`/${rule}`) : base === rule));
    if (hit) hits.add(file);
  }
  return [...hits].sort();
}

// git이 무시하는 파일(.claude/settings.local.json, .codex/config.toml 등)은 git 대조에 보이지 않는다(검토 2 S4).
// 저장소 최상위의 보호 폴더 아래 모든 파일과 보호 파일을 내용 해시로 적는다. 링크(junction 포함)는 따라가지 않고 대상을 적으므로,
// 보호 폴더가 링크로 바뀌어도 차이가 난다. 없는 경로는 적지 않고, 그 밖의 읽기 실패는 던진다.
export function snapshotProtected(repoDir, protectedPaths, fsx = fs) {
  const snapshot = {};
  const visit = (rel) => {
    const full = path.join(repoDir, rel);
    let stat;
    try {
      stat = fsx.lstatSync(full);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink()) snapshot[rel] = `link:${fsx.readlinkSync(full)}`;
    else if (stat.isDirectory()) {
      snapshot[rel] = "dir";
      for (const name of fsx.readdirSync(full).sort()) visit(`${rel}/${name}`);
    } else snapshot[rel] = `file:${hashText(fsx.readFileSync(full))}`;
  };
  for (const rule of protectedPaths) visit(normalizePath(rule).replace(/\/$/, ""));
  return snapshot;
}
