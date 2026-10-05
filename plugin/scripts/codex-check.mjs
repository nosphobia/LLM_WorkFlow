#!/usr/bin/env node
// 연결부 점검: Codex CLI, Codex 플러그인, Superpowers 버전을 바꿀 때마다 실행한다.
// OS 임시 폴더에 작은 저장소를 만들고 래퍼를 통해 Codex를 실제로 부른다. 만든 폴더는 지우지 않는다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PINS, EXIT, USAGE_FILE } from "./lib/pins.mjs";
import { evaluateBoundary, trailerModel } from "./lib/check-eval.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.join(here, "codex-run.mjs");
const outsideDir = path.resolve(here, "..", ".check-outside");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "llm-workflow-check-"));
const repo = path.join(root, "repo");
const workspace = path.join(repo, ".superpowers", "sdd", "check");
const results = [];

const REPORT_RULES = [
  "End your final message with exactly these five lines:",
  "STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>",
  "CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>",
  "COMMIT_MESSAGE: <one-line commit message, or none>",
  "TESTS: <command and its final result line, or none>",
  "CONCERNS: <text, or none>"
].join("\n");

const IMPLEMENT_PROMPT = [
  "You are the implementer for one small task in this repository. The design is approved: do not brainstorm and do not ask questions.",
  "Add a function `farewell(name)` to greet.py that returns `잘 가, {name}` (for example `farewell(\"코덱스\")` returns `잘 가, 코덱스`).",
  "Test first: add `test_farewell` to tests/test_greet.py, run `python -m unittest` and confirm it fails, then implement and confirm all tests pass.",
  "Do not commit and do not run any git command that writes. The wrapper commits the files you report.",
  "Use exactly `feat: 작별 인사 추가` as COMMIT_MESSAGE.",
  REPORT_RULES
].join("\n");

const RESUME_PROMPT = [
  "Do not change any files and do not run any commands.",
  "Earlier in this same conversation you added one function to greet.py.",
  "End your final message with exactly these five lines:",
  "STATUS: DONE",
  "CHANGED_FILES: none",
  "COMMIT_MESSAGE: none",
  "TESTS: none",
  "CONCERNS: <only the exact name of the function you added earlier>"
].join("\n");

const TIMEOUT_PROMPT = [
  "This is a timeout check. Do not change any files yourself.",
  "Run this command exactly once and wait for it to finish: python -c \"import time; time.sleep(90); open('late.txt','w').write('x')\"",
  "End your final message with exactly these five lines:",
  "STATUS: DONE",
  "CHANGED_FILES: late.txt",
  "COMMIT_MESSAGE: chore: late",
  "TESTS: none",
  "CONCERNS: none"
].join("\n");

const boundaryPrompt = (dir) => [
  "This is a sandbox boundary check. Do not change any files in this repository.",
  `Run this command exactly once and wait for it to finish: python boundary_probe.py "${dir}"`,
  "End your final message with exactly these five lines:",
  "STATUS: DONE",
  "CHANGED_FILES: none",
  "COMMIT_MESSAGE: none",
  "TESTS: <the single JSON line the command printed, copied exactly>",
  "CONCERNS: none"
].join("\n");

const BOUNDARY_PROBE = `import json
import os
import socket
import sys

outside = sys.argv[1]
results = {}
try:
    with open(os.path.join(outside, "probe.txt"), "w", encoding="utf-8") as handle:
        handle.write("x")
    results["outside_write"] = "allowed"
except OSError:
    results["outside_write"] = "denied"
try:
    with open(os.path.join(".git", "llm-workflow-probe"), "w", encoding="utf-8") as handle:
        handle.write("x")
    results["git_write"] = "allowed"
except OSError:
    results["git_write"] = "denied"
try:
    socket.create_connection(("example.com", 443), timeout=5).close()
    results["network"] = "allowed"
except OSError:
    results["network"] = "denied"
print(json.dumps(results))
`;

function git(...args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function write(relative, text) {
  const file = path.join(repo, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function setupRepo() {
  fs.mkdirSync(repo, { recursive: true });
  write("greet.py", '"""연결부 점검용 모듈."""\n\n\ndef greet(name):\n    return f"안녕, {name}"\n');
  write("tests/__init__.py", "");
  write(
    "tests/test_greet.py",
    'import unittest\n\nfrom greet import greet\n\n\nclass GreetTest(unittest.TestCase):\n    def test_greet(self):\n        self.assertEqual(greet("코덱스"), "안녕, 코덱스")\n\n\nif __name__ == "__main__":\n    unittest.main()\n'
  );
  write("boundary_probe.py", BOUNDARY_PROBE);
  write(".gitignore", "__pycache__/\n");
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  git("config", "user.name", "llm-workflow-check");
  git("config", "user.email", "check@example.invalid");
  git("add", "-A");
  git("commit", "-q", "-m", "check: initial");
  git("switch", "-q", "-c", "feature/check");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });
}

function callWrapper(name, args, prompt) {
  const promptFile = path.join(workspace, `${name}-prompt.md`);
  const out = path.join(workspace, "codex-results", `${name}.json`);
  fs.writeFileSync(promptFile, prompt);
  const proc = spawnSync(
    process.execPath,
    [wrapper, ...args, "--cwd", repo, "--prompt-file", promptFile, "--workspace", workspace, "--out", out],
    { encoding: "utf8", timeout: 40 * 60_000 }
  );
  const result = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null;
  return { exitCode: proc.status, stderr: (proc.stderr ?? "").trim(), result };
}

function record(name, pass, detail) {
  results.push({ name, pass, detail });
}

function printHeader() {
  let codexVersion = "알 수 없음";
  try {
    codexVersion = execSync("codex --version", { encoding: "utf8" }).trim();
  } catch {
    // 버전을 못 읽어도 점검은 계속한다. 1번 환경 점검이 실패를 알린다.
  }
  console.log("연결부 점검");
  console.log(`- Codex CLI: ${codexVersion}`);
  console.log(`- Codex 플러그인(Claude Code): ${PINS.codexPlugin.version} (${PINS.codexPlugin.sha})`);
  console.log(`- Superpowers(Claude Code): ${PINS.claudeSuperpowers.version} (${PINS.claudeSuperpowers.sha})`);
  console.log(`- Superpowers(Codex): ${PINS.codexSuperpowers.version}`);
  console.log(`- Node: ${process.version}`);
  console.log(`- 임시 저장소: ${repo}`);
}

function finishAll() {
  console.log("");
  for (const item of results) console.log(`[${item.pass ? "통과" : "실패"}] ${item.name} — ${item.detail}`);
  console.log("");
  console.log(`임시 저장소는 지우지 않았습니다: ${root}`);
  process.exit(results.length === 8 && results.every((item) => item.pass) ? 0 : 1);
}

function main() {
  setupRepo();
  printHeader();

  const check = spawnSync(process.execPath, [wrapper, "check", "--cwd", repo], { encoding: "utf8" });
  record("1. 환경 점검", check.status === EXIT.OK, (check.stdout || check.stderr || "").trim());
  if (check.status !== EXIT.OK) return finishAll();

  const impl = callWrapper("implement", ["start", "--role", "check", "--task", "1"], IMPLEMENT_PROMPT);
  const committed = impl.result?.commit ? git("show", "--name-only", "--format=", "HEAD").split(/\r?\n/).filter(Boolean).sort() : [];
  const model = impl.result?.commit ? trailerModel(git("log", "-1", "--format=%B")) : null;
  const filesOk = JSON.stringify(committed) === JSON.stringify(["greet.py", "tests/test_greet.py"]);
  record(
    "2. 구현과 커밋",
    impl.exitCode === EXIT.OK && filesOk && model !== null && model !== "unknown-model",
    `exit=${impl.exitCode} 커밋 파일=${committed.join(", ") || "-"} 모델=${model ?? "-"} ${impl.result?.reason ?? impl.stderr}`
  );

  const subject = impl.result?.commit ? git("log", "-1", "--format=%s") : "";
  const unittest = spawnSync("python", ["-m", "unittest", "-q"], { cwd: repo, encoding: "utf8" });
  record("3. 한글", subject === "feat: 작별 인사 추가" && unittest.status === 0, `커밋 제목=${subject || "-"} 테스트 종료 코드=${unittest.status}`);

  if (impl.result?.threadId) {
    const resume = callWrapper(
      "resume",
      ["resume", "--role", "check", "--task", "1", "--round", "1", "--thread", impl.result.threadId],
      RESUME_PROMPT
    );
    const answer = String(resume.result?.report?.concerns ?? "").replace(/[`*]/g, "").trim();
    record(
      "4. 대화 이어가기",
      resume.exitCode === EXIT.OK && resume.result?.threadId === impl.result.threadId && answer === "farewell",
      `exit=${resume.exitCode} thread=${resume.result?.threadId ?? "-"} 답=${answer || "-"}`
    );
  } else {
    record("4. 대화 이어가기", false, "2번에서 대화 ID를 얻지 못해 건너뜀");
  }

  const bad = callWrapper("bad-model", ["start", "--role", "check", "--task", "5", "--model", "no-such-model-xyz"], "Reply with OK.");
  record("5. 실패 판별", bad.exitCode === EXIT.FAILED && String(bad.result?.reason ?? "").startsWith("Codex 호출 실패") && bad.result?.corrections === 0, `exit=${bad.exitCode} ${bad.result?.reason ?? bad.stderr}`);

  const outsideFile = path.join(outsideDir, "probe.txt");
  const gitFile = path.join(repo, ".git", "llm-workflow-probe");
  if (fs.existsSync(outsideFile)) {
    record("6. 샌드박스 경계", false, `이전 실행이 남긴 파일을 먼저 지워 주세요: ${outsideFile}`);
  } else if (
    // 양성 대조: 샌드박스 밖에서는 같은 연결이 되어야 "network: denied"가 샌드박스 덕분이라고 말할 수 있다.
    spawnSync("python", ["-c", "import socket; socket.create_connection(('example.com', 443), timeout=5).close()"], { encoding: "utf8" }).status !== 0
  ) {
    record("6. 샌드박스 경계", false, "판정 불가: 이 PC에서 example.com:443에 접속할 수 없어 네트워크 차단을 확인할 수 없습니다");
  } else {
    const probe = callWrapper("boundary", ["start", "--role", "check", "--task", "6"], boundaryPrompt(outsideDir));
    const verdict =
      probe.exitCode === EXIT.OK
        ? evaluateBoundary(probe.result?.report?.tests, { outsideFileExists: fs.existsSync(outsideFile), gitFileExists: fs.existsSync(gitFile) })
        : { pass: false, detail: `exit=${probe.exitCode} ${probe.result?.reason ?? probe.stderr}` };
    record("6. 샌드박스 경계", verdict.pass, verdict.detail);
  }

  const usageFile = path.join(workspace, USAGE_FILE);
  const lines = fs.existsSync(usageFile)
    ? fs.readFileSync(usageFile, "utf8").split(/\r?\n/).filter(Boolean).map((raw) => JSON.parse(raw))
    : [];
  const okLines = lines.filter((item) => item.exitCode === EXIT.OK);
  const usageOk = okLines.length > 0 && okLines.every((item) => item.tokens?.total_tokens > 0 && typeof item.weeklyEnd === "number");
  record("7. 사용량 기록", usageOk, `기록 ${lines.length}줄, 성공 호출 ${okLines.length}줄`);

  // 8번은 마지막에 한다: 중단된 Codex가 90초 뒤에 파일을 만드는지 보려면 호출 시작 후 120초를 기다려야 한다.
  const timeoutStart = Date.now();
  const late = callWrapper("timeout", ["start", "--role", "check", "--task", "8", "--timeout-min", "0.5"], TIMEOUT_PROMPT);
  const remaining = timeoutStart + 120_000 - Date.now();
  if (remaining > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, remaining);
  const lateExists = fs.existsSync(path.join(repo, "late.txt"));
  const interrupted = late.result?.interrupt?.interrupted === true;
  record(
    "8. 시간 초과 중단",
    late.exitCode === EXIT.FAILED && String(late.result?.reason ?? "").includes("제한 시간") && interrupted && !lateExists,
    `exit=${late.exitCode} 중단=${interrupted} late.txt=${lateExists ? "있음" : "없음"} ${late.result?.reason ?? late.stderr}`
  );

  finishAll();
}

main();
