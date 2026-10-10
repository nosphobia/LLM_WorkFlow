// 호출 뒤 Codex 명령 전용 임시 폴더를 사용자 권한으로 비우고, 저장소 최상위에 새로 생긴 수상한 폴더를 찾는다.
// Python 3.13의 mkdtemp 폴더는 샌드박스 안에서는 못 지우지만 소유자인 사용자는 지울 수 있다(명세 2.4절).
import fs from "node:fs";
import path from "node:path";

export function emptyDir(dir, fsx = fs) {
  const result = { removed: [], failed: [] };
  if (!fsx.existsSync(dir)) return result;
  let names;
  try {
    names = fsx.readdirSync(dir);
  } catch (error) {
    if (error?.code !== "ENOENT") result.failed.push(`${dir}: ${error?.code ?? error?.message ?? error}`);
    return result;
  }
  for (const name of names) {
    try {
      fsx.rmSync(path.join(dir, name), { recursive: true, force: true });
      result.removed.push(name);
    } catch (error) {
      result.failed.push(`${name}: ${error?.code ?? error?.message ?? error}`);
    }
  }
  return result;
}

const MANAGED = new Set([".git", ".superpowers", ".codex"]);

export function listRootDirs(repoDir, fsx = fs) {
  return fsx
    .readdirSync(repoDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !MANAGED.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

// 빈 폴더는 git 상태에 보이지 않는다. 새 폴더 아래에 git 변경이 하나도 없고 무시 대상도 아니면 경고한다.
export function suspiciousNewDirs(before, after, changedFiles, isIgnored) {
  const known = new Set(before);
  return after.filter(
    (name) => !known.has(name) && !isIgnored(`${name}/`) && !changedFiles.some((file) => file.startsWith(`${name}/`))
  );
}
