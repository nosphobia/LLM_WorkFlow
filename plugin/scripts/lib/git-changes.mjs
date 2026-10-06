// 마지막 커밋 이후의 변경 파일을 읽고, Codex가 보고한 파일만 커밋한다. 시간 초과 뒤 변경 감시용 스냅샷도 만든다.
import { execFileSync } from "node:child_process";
import { normalizePath } from "./report.mjs";

export function parsePorcelainZ(output) {
  const entries = output.split("\0");
  const files = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    files.push(normalizePath(entry.slice(3)));
    if (code.includes("R")) {
      if (entries[i + 1]) files.push(normalizePath(entries[i + 1]));
      i += 1;
    } else if (code.includes("C")) {
      i += 1;
    }
  }
  return [...new Set(files)].sort();
}

function git(repoDir, args, options = {}) {
  return execFileSync("git", ["-C", repoDir, ...args], { encoding: "utf8", ...options });
}

export function listChangedFiles(repoDir) {
  return parsePorcelainZ(git(repoDir, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
}

export function compareChangedFiles(reported, actual) {
  const reportedSet = new Set(reported.map(normalizePath));
  const actualSet = new Set(actual.map(normalizePath));
  const missing = [...reportedSet].filter((file) => !actualSet.has(file)).sort();
  const extra = [...actualSet].filter((file) => !reportedSet.has(file)).sort();
  return { match: missing.length === 0 && extra.length === 0, missing, extra };
}

export function buildCommitMessage(subject, model) {
  return `${subject}\n\nCo-Authored-By: Codex ${model || "unknown-model"} <noreply@openai.com>\n`;
}

export function commitFiles(repoDir, files, message) {
  git(repoDir, ["add", "-A", "--", ...files]);
  git(repoDir, ["commit", "-q", "-F", "-"], { input: message });
  return git(repoDir, ["rev-parse", "--short", "HEAD"]).trim();
}

export function buildSnapshot(files, stat) {
  const snapshot = {};
  for (const file of files) {
    const info = stat(file);
    snapshot[file] = info ? `${info.mtimeMs}:${info.size}` : "missing";
  }
  return snapshot;
}

export function diffSnapshots(before, after) {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...paths].filter((file) => before[file] !== after[file]).sort();
}
