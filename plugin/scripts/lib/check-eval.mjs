// 연결부 점검 스크립트의 판정 함수.
export function trailerModel(commitMessage) {
  const match = /^Co-Authored-By: Codex (\S+) <noreply@openai\.com>$/m.exec(commitMessage ?? "");
  return match ? match[1] : null;
}

// 세션 기록(rollout)에서 모든 차례의 모델·추론 강도와, 개발자 지시에 메모리 안내("## Memory" 절)가 들어갔는지 본다.
export function evaluatePinnedTurns(rolloutText, { model, effort }) {
  const turns = [];
  let memory = false;
  for (const raw of String(rolloutText ?? "").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      continue;
    }
    const payload = event.payload ?? {};
    if (event.type === "turn_context") turns.push({ model: payload.model ?? null, effort: payload.effort ?? null });
    if (event.type === "response_item" && payload.type === "message" && payload.role === "developer") {
      const text = (Array.isArray(payload.content) ? payload.content : []).map((part) => String(part?.text ?? "")).join("\n");
      if (/^##\s*Memory\s*$/m.test(text)) memory = true;
    }
  }
  if (turns.length === 0) return { pass: false, detail: "세션 기록에 차례 정보가 없습니다" };
  const wrong = turns.filter((turn) => turn.model !== model || turn.effort !== effort);
  const problems = [];
  if (memory) problems.push("개발자 지시에 메모리 안내가 들어 있음");
  if (wrong.length > 0) problems.push(`설정(${model}, ${effort})과 다른 차례: ${wrong.map((turn) => `모델=${turn.model} 추론 강도=${turn.effort}`).join(", ")}`);
  if (problems.length > 0) return { pass: false, detail: problems.join("; ") };
  return { pass: true, detail: `차례 ${turns.length}개 모두 모델=${model} 추론 강도=${effort}, 메모리 안내 없음` };
}

export function evaluateBoundary(testsLine, { outsideFileExists, gitFileExists, shimFileExists = false }) {
  const text = String(testsLine ?? "");
  let probe = null;
  try {
    probe = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    probe = null;
  }
  if (!probe || typeof probe !== "object") return { pass: false, detail: `점검 출력을 읽을 수 없습니다: ${text || "없음"}`, networkAllowed: null };

  // Windows unelevated 샌드박스는 네트워크를 막지 못한다. 파일 경계만 판정하고 네트워크는 기록만 한다.
  const networkAllowed = probe.network === "allowed";
  const shimChecked = "shim_write" in probe;
  const problems = [];
  if (probe.outside_write !== "denied" || outsideFileExists) problems.push("저장소 밖 쓰기가 허용됨");
  if (probe.git_write !== "denied" || gitFileExists) problems.push(".git 쓰기가 허용됨");
  if (shimChecked && (probe.shim_write !== "denied" || shimFileExists)) problems.push("보정 모듈 폴더 쓰기가 허용됨");
  if (problems.length > 0) return { pass: false, detail: problems.join(", "), networkAllowed };
  const network = networkAllowed ? "허용됨 (알려진 한계: Windows unelevated 샌드박스)" : "거부됨";
  const shimNote = shimChecked ? ", 보정 모듈 폴더 쓰기도 거부됨" : "";
  return { pass: true, detail: `저장소 밖 쓰기와 .git 쓰기가 거부됨${shimNote}; 네트워크: ${network}`, networkAllowed };
}
