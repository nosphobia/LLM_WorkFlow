// 래퍼가 사용자 권한으로 쓰거나 지우는 경로가 허용된 경계 안의 실제 경로인지 확인한다(검토 2 S1·S2).
// 경계 아래 각 단계가 링크(junction 포함)가 아니어야 하고, 이미 있는 가장 깊은 경로의 실제 위치도 경계 안이어야 한다.
import fs from "node:fs";
import path from "node:path";

const isInside = (child, parent) => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

export function checkSafePath(boundary, target, fsx = fs) {
  const fail = (reason) => ({ ok: false, reason });
  if (!isInside(target, boundary)) return fail(`${target}: 허용된 경계(${boundary}) 밖입니다`);
  let current = boundary;
  let exists = true;
  for (const part of path.relative(boundary, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try {
      stat = fsx.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT") {
        exists = false;
        current = path.dirname(current);
        break;
      }
      return fail(`${current}: 경로를 확인하지 못했습니다 (${error?.code ?? error?.message ?? error})`);
    }
    if (stat.isSymbolicLink()) return fail(`${current}: 링크입니다`);
  }
  try {
    const real = fsx.realpathSync.native(current);
    if (!isInside(real, fsx.realpathSync.native(boundary))) return fail(`${current}: 실제 경로(${real})가 허용된 경계(${boundary}) 밖입니다`);
  } catch (error) {
    return fail(`${current}: 실제 경로를 확인하지 못했습니다 (${error?.code ?? error?.message ?? error})`);
  }
  return { ok: true, exists };
}

// 확인에 실패하면 던진다. 호출한 쪽은 환경 문제(종료 코드 5)로 멈춘다.
export function assertSafePath(boundary, target, fsx = fs) {
  const result = checkSafePath(boundary, target, fsx);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

// ENOENT만 "파일 없음"(null)이다. 그 밖의 읽기 실패를 없음으로 보고 덮어쓰면 기존 내용을 잃는다.
export function readExisting(file, fsx = fs) {
  try {
    return fsx.readFileSync(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
