// Codex 최종 메시지 끝의 보고 다섯 줄을 해석하고, 형식 위반 때 보낼 정정 요청 문구를 만든다.
export const STATUSES = Object.freeze(["DONE", "DONE_WITH_CONCERNS", "NEEDS_CONTEXT", "BLOCKED"]);
export const REPORT_FIELDS = Object.freeze(["STATUS", "CHANGED_FILES", "COMMIT_MESSAGE", "TESTS", "CONCERNS"]);

export const REPORT_TEMPLATE = [
  "STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>",
  "CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>",
  "COMMIT_MESSAGE: <one-line commit message, or none>",
  "TESTS: <commands you ran and their final result lines, or none>",
  "CONCERNS: <text, or none>"
].join("\n");

const LINE = /^\s*(?:[-*>]\s+)?[*_`]*(STATUS|CHANGED_FILES|COMMIT_MESSAGE|TESTS|CONCERNS)[*_`]*\s*:\s*[*_`]*\s*(.*?)\s*$/;

export function isDone(status) {
  return status === "DONE" || status === "DONE_WITH_CONCERNS";
}

export function normalizePath(value) {
  return value
    .trim()
    .replace(/^[`"']+|[`"']+$/g, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}

export function parseReport(message) {
  if (typeof message !== "string" || message.trim() === "") {
    return { ok: false, error: "Codex 최종 메시지가 비어 있습니다" };
  }
  const values = {};
  for (const line of message.split(/\r?\n/)) {
    const match = LINE.exec(line);
    if (match) values[match[1]] = match[2];
  }
  const missing = REPORT_FIELDS.filter((field) => !(field in values));
  if (missing.length > 0) return { ok: false, error: `보고 줄이 없습니다: ${missing.join(", ")}` };

  const status = values.STATUS.replace(/[`*]/g, "").trim();
  if (!STATUSES.includes(status)) return { ok: false, error: `STATUS 값을 해석할 수 없습니다: ${values.STATUS}` };

  const changedFiles = parseFileList(values.CHANGED_FILES);
  const commitMessage = isNone(values.COMMIT_MESSAGE) ? null : values.COMMIT_MESSAGE.trim();
  if (isDone(status) && changedFiles.length > 0 && commitMessage === null) {
    return { ok: false, error: "CHANGED_FILES가 있는데 COMMIT_MESSAGE가 none입니다" };
  }
  return {
    ok: true,
    status,
    changedFiles,
    commitMessage,
    tests: values.TESTS.trim(),
    concerns: isNone(values.CONCERNS) ? null : values.CONCERNS.trim()
  };
}

export function buildFormatCorrection(error) {
  return [
    "Your final message could not be parsed by the workflow wrapper.",
    `Problem: ${error}`,
    "Do not change any files. Reply again, ending your message with exactly these five lines and the values you intended:",
    REPORT_TEMPLATE
  ].join("\n");
}

export function buildMismatchCorrection({ missing, extra }) {
  return [
    "CHANGED_FILES does not match the uncommitted changes in the repository.",
    `Reported but not changed: ${missing.length > 0 ? missing.join(", ") : "none"}`,
    `Changed but not reported: ${extra.length > 0 ? extra.join(", ") : "none"}`,
    "CHANGED_FILES must list every file changed since the last commit, as repository-relative paths.",
    "If a changed file is a stray artifact, delete it or add an ignore rule and report that change; otherwise add it to CHANGED_FILES.",
    "Then end your message with exactly these five lines:",
    REPORT_TEMPLATE
  ].join("\n");
}

function isNone(value) {
  const text = value.replace(/[`*]/g, "").trim().toLowerCase();
  return text === "" || text === "none";
}

function parseFileList(value) {
  if (isNone(value)) return [];
  return [...new Set(value.split(",").map(normalizePath).filter(Boolean))];
}
