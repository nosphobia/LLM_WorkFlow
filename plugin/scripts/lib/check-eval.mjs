// 연결부 점검 스크립트의 판정 함수.
export function trailerModel(commitMessage) {
  const match = /^Co-Authored-By: Codex (\S+) <noreply@openai\.com>$/m.exec(commitMessage ?? "");
  return match ? match[1] : null;
}

export function evaluateBoundary(testsLine, { outsideFileExists, gitFileExists }) {
  const text = String(testsLine ?? "");
  let probe = null;
  try {
    probe = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    probe = null;
  }
  if (!probe || typeof probe !== "object") return { pass: false, detail: `점검 출력을 읽을 수 없습니다: ${text || "없음"}` };

  const problems = [];
  if (probe.outside_write !== "denied" || outsideFileExists) problems.push("저장소 밖 쓰기가 허용됨");
  if (probe.git_write !== "denied" || gitFileExists) problems.push(".git 쓰기가 허용됨");
  if (probe.network !== "denied") problems.push("네트워크가 허용됨");
  if (problems.length > 0) return { pass: false, detail: problems.join(", ") };
  return { pass: true, detail: "저장소 밖 쓰기, .git 쓰기, 네트워크가 모두 거부됨" };
}
