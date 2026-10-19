#!/usr/bin/env node
// 연결부 점검: Codex CLI, Codex 플러그인, Superpowers 버전, 요금제를 바꿀 때마다 실행한다.
// OS 임시 폴더에 작은 저장소를 만들고 래퍼를 통해 Codex를 실제로 부른다. 만든 폴더는 지우지 않는다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PINS, EXIT, USAGE_FILE, pluginPaths, defaultPaths } from "./lib/pins.mjs";
import { evaluateBoundary, evaluatePinnedTurns, trailerModel } from "./lib/check-eval.mjs";
import { findRolloutFile } from "./lib/rollout.mjs";
import { parseSettings } from "./lib/settings.mjs";
import { codexTmpDir } from "./lib/project-config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.join(here, "codex-run.mjs");
const outsideDir = path.resolve(here, "..", ".check-outside");
const shimProbeFile = path.join(pluginPaths().shimDir, "llm-workflow-probe.txt");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "llm-workflow-check-"));
const repo = path.join(root, "repo");
const workspace = path.join(repo, ".superpowers", "sdd", "check");
const results = [];
const ITEM_COUNT = 15;

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

const PROTECTED_PROMPT = [
  "This is a protected-path check. Do not change any files and do not run any commands.",
  "End your final message with exactly these five lines:",
  "STATUS: DONE",
  "CHANGED_FILES: CLAUDE.md",
  "COMMIT_MESSAGE: chore: protected path check",
  "TESTS: none",
  "CONCERNS: none"
].join("\n");

const NETWORK_COMMAND_PROMPT = [
  "This is a network-command detection check. Do not change any files.",
  "Run this command exactly once and wait for it to finish (it may fail, that is fine): Invoke-WebRequest -UseBasicParsing -Method Head -Uri https://example.com | Select-Object -ExpandProperty StatusCode",
  "End your final message with exactly these five lines:",
  "STATUS: DONE",
  "CHANGED_FILES: none",
  "COMMIT_MESSAGE: none",
  "TESTS: <the command's output or error, one line>",
  "CONCERNS: none"
].join("\n");

const TEMP_PROMPT = [
  "This is a temporary-folder check. Do not change any files in this repository.",
  "Run this command exactly once and wait for it to finish:",
  "python -c \"import os, shutil, tempfile; d = tempfile.TemporaryDirectory(); open(os.path.join(d.name, 'f.txt'), 'w').write('x'); d.cleanup(); print('TD_OK' if not os.path.exists(d.name) else 'TD_LEFT'); p = tempfile.mkdtemp(); shutil.rmtree(p); print('MK_OK' if not os.path.exists(p) else 'MK_LEFT'); print('TMPDIR=' + tempfile.gettempdir())\"",
  "End your final message with exactly these five lines:",
  "STATUS: DONE",
  "CHANGED_FILES: none",
  "COMMIT_MESSAGE: none",
  "TESTS: <the three lines the command printed, joined with spaces, or the error>",
  "CONCERNS: none"
].join("\n");

const TIMEOUT_PROMPT = [
  "This is a timeout check. Do not change any files yourself.",
  "Run this command exactly once and wait for it to finish: python -c \"open('started.txt','w').write('x'); import time; time.sleep(90); open('late.txt','w').write('x')\"",
  "End your final message with exactly these five lines:",
  "STATUS: DONE",
  "CHANGED_FILES: late.txt",
  "COMMIT_MESSAGE: chore: late",
  "TESTS: none",
  "CONCERNS: none"
].join("\n");

const boundaryPrompt = (dir, shim) =>
  [
    "This is a sandbox boundary check. Do not change any files in this repository.",
    `Run this command exactly once and wait for it to finish: python boundary_probe.py "${dir}" "${shim}"`,
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
shim = sys.argv[2] if len(sys.argv) > 2 else None
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
if shim:
    try:
        with open(os.path.join(shim, "llm-workflow-probe.txt"), "w", encoding="utf-8") as handle:
            handle.write("x")
        results["shim_write"] = "allowed"
    except OSError:
        results["shim_write"] = "denied"
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
  write("CLAUDE.md", "# 연결부 점검 저장소 규칙\n");
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
  const order = (item) => Number.parseInt(item.name, 10) || 99;
  results.sort((a, b) => order(a) - order(b));
  console.log("");
  for (const item of results) console.log(`[${item.pass ? "통과" : "실패"}] ${item.name} — ${item.detail}`);
  console.log("");
  console.log(`임시 저장소는 지우지 않았습니다: ${root}`);
  process.exit(results.length === ITEM_COUNT && results.every((item) => item.pass) ? 0 : 1);
}

function main() {
  setupRepo();
  printHeader();

  const check = spawnSync(process.execPath, [wrapper, "check", "--cwd", repo], { encoding: "utf8", timeout: 5 * 60_000 });
  const checkLine = (check.stdout || check.stderr || "").trim();
  const configWritten = fs.existsSync(path.join(repo, ".codex", "config.toml"));
  record("1. 환경 점검", check.status === EXIT.OK && configWritten, `${checkLine} 프로젝트 Codex 설정=${configWritten ? "있음" : "없음"}`);
  record("13. 외부 연결 도구", check.status === EXIT.OK && /외부 연결 도구 0개/.test(checkLine), /외부 연결 도구[^)]*\)?/.exec(checkLine)?.[0] ?? checkLine);
  if (check.status !== EXIT.OK) return finishAll();

  const limits = spawnSync(process.execPath, [wrapper, "limits", "--cwd", repo, "--phase", "call"], { encoding: "utf8", timeout: 2 * 60_000 });
  const limitsOut = (limits.stdout || limits.stderr || "").trim();
  record(
    "14. 한도 확인",
    [EXIT.OK, EXIT.LIMIT].includes(limits.status) && /^codex-run limits status=(ok|short) plan=\S+/m.test(limitsOut) && /^window=\d+m /m.test(limitsOut),
    limitsOut.split(/\r?\n/).join(" | ")
  );

  // 2~12번 중 예외가 나도 10번(브로커 정리)은 반드시 한다.
  try {
    runCodexItems();
  } catch (error) {
    record("점검 중 예외", false, String(error?.stack ?? error));
  }
  closeBroker();
  finishAll();
}

function runCodexItems() {
  const impl = callWrapper("implement", ["start", "--role", "check", "--task", "1"], IMPLEMENT_PROMPT);
  const committed = impl.result?.commit ? git("show", "--name-only", "--format=", "HEAD").split(/\r?\n/).filter(Boolean).sort() : [];
  const model = impl.result?.commit ? trailerModel(git("log", "-1", "--format=%B")) : null;
  const filesOk = JSON.stringify(committed) === JSON.stringify(["greet.py", "tests/test_greet.py"]);
  record(
    "2. 구현과 커밋",
    impl.exitCode === EXIT.OK && filesOk && model !== null && model !== "unknown-model",
    `exit=${impl.exitCode} 커밋 파일=${committed.join(", ") || "-"} 모델=${model ?? "-"} ${impl.result?.reason ?? impl.stderr}`
  );

  // 15번: 래퍼가 프로젝트 Codex 설정으로 고정한 모델·추론 강도와 메모리 끄기가 실제 차례에 적용됐는지 세션 기록으로 본다.
  const pinned = parseSettings(fs.readFileSync(pluginPaths().settingsFile, "utf8"));
  const rolloutFile = impl.result?.threadId ? findRolloutFile(defaultPaths().codexSessions, impl.result.threadId) : null;
  if (!pinned.ok) record("15. 모델·메모리 고정", false, pinned.error);
  else if (!rolloutFile) record("15. 모델·메모리 고정", false, `2번 대화의 세션 기록을 찾지 못함: ${impl.result?.threadId ?? "-"}`);
  else {
    const verdict = evaluatePinnedTurns(fs.readFileSync(rolloutFile, "utf8"), { model: pinned.settings.codex.model, effort: pinned.settings.codex.reasoningEffort });
    record("15. 모델·메모리 고정", verdict.pass, verdict.detail);
  }

  const subject = impl.result?.commit ? git("log", "-1", "--format=%s") : "";
  const unittest = spawnSync("python", ["-m", "unittest", "-q"], { cwd: repo, encoding: "utf8", timeout: 2 * 60_000 });
  record("3. 한글", subject === "feat: 작별 인사 추가" && unittest.status === 0, `커밋 제목=${subject || "-"} 테스트 종료 코드=${unittest.status}`);

  if (impl.result?.threadId) {
    const resume = callWrapper("resume", ["resume", "--role", "check", "--task", "1", "--round", "1", "--thread", impl.result.threadId], RESUME_PROMPT);
    const answer = String(resume.result?.report?.concerns ?? "").replace(/[`*]/g, "").trim();
    record(
      "4. 대화 이어가기",
      resume.exitCode === EXIT.OK && resume.result?.threadId === impl.result.threadId && answer === "farewell",
      `exit=${resume.exitCode} thread=${resume.result?.threadId ?? "-"} 답=${answer || "-"}`
    );

    // 12번: 점검 스크립트가 CLAUDE.md를 바꾸고, Codex에게는 그 파일을 보고만 하게 한다. 래퍼가 커밋을 거부해야 한다.
    const before = git("rev-parse", "HEAD");
    fs.appendFileSync(path.join(repo, "CLAUDE.md"), "- 보호 경로 점검 중에 바꾼 줄\n");
    const guarded = callWrapper("protected", ["resume", "--role", "check", "--task", "12", "--round", "1", "--thread", impl.result.threadId], PROTECTED_PROMPT);
    const after = git("rev-parse", "HEAD");
    git("checkout", "--", "CLAUDE.md");
    record(
      "12. 보호 경로",
      guarded.exitCode === EXIT.FAILED && String(guarded.result?.reason ?? "").startsWith("보호 경로 변경: CLAUDE.md") && before === after,
      `exit=${guarded.exitCode} 커밋 변화=${before === after ? "없음" : "있음"} ${guarded.result?.reason ?? guarded.stderr}`
    );
  } else {
    record("4. 대화 이어가기", false, "2번에서 대화 ID를 얻지 못해 건너뜀");
    record("12. 보호 경로", false, "2번에서 대화 ID를 얻지 못해 건너뜀");
  }

  const bad = callWrapper("bad-model", ["start", "--role", "check", "--task", "5", "--model", "no-such-model-xyz"], "Reply with OK.");
  record(
    "5. 실패 판별",
    bad.exitCode === EXIT.FAILED && String(bad.result?.reason ?? "").startsWith("Codex 호출 실패") && bad.result?.corrections === 0,
    `exit=${bad.exitCode} ${bad.result?.reason ?? bad.stderr}`
  );

  const outsideFile = path.join(outsideDir, "probe.txt");
  const gitFile = path.join(repo, ".git", "llm-workflow-probe");
  if (fs.existsSync(outsideFile) || fs.existsSync(shimProbeFile)) {
    record("6. 샌드박스 경계", false, `이전 실행이 남긴 파일을 먼저 지워 주세요: ${[outsideFile, shimProbeFile].filter((file) => fs.existsSync(file)).join(", ")}`);
  } else {
    // 양성 대조: 샌드박스 밖에서도 접속이 안 되는 PC라면 네트워크 결과는 판정할 수 없다. 네트워크는 정보일 뿐 합격 조건이 아니다.
    // 파이썬의 timeout은 DNS 조회를 묶지 못하므로 프로세스에도 15초 상한을 둔다. 넘기면 접속 불가로 본다.
    const pcReachesNetwork =
      spawnSync("python", ["-c", "import socket; socket.create_connection(('example.com', 443), timeout=5).close()"], {
        encoding: "utf8",
        timeout: 15_000
      }).status === 0;
    const probe = callWrapper("boundary", ["start", "--role", "check", "--task", "6"], boundaryPrompt(outsideDir, pluginPaths().shimDir));
    const verdict =
      probe.exitCode === EXIT.OK
        ? evaluateBoundary(probe.result?.report?.tests, {
            outsideFileExists: fs.existsSync(outsideFile),
            gitFileExists: fs.existsSync(gitFile),
            shimFileExists: fs.existsSync(shimProbeFile)
          })
        : { pass: false, detail: `exit=${probe.exitCode} ${probe.result?.reason ?? probe.stderr}` };
    const shimChecked = /보정 모듈 폴더 쓰기도 거부됨/.test(verdict.detail);
    record(
      "6. 샌드박스 경계",
      verdict.pass && shimChecked,
      pcReachesNetwork ? verdict.detail : `${verdict.detail} (이 PC에서 외부 접속이 안 되어 네트워크 결과는 판정 불가)`
    );
  }

  const net = callWrapper("network", ["start", "--role", "check", "--task", "7"], NETWORK_COMMAND_PROMPT);
  const detected = net.result?.networkCommands?.length ?? 0;
  record(
    "7. 네트워크 명령 탐지",
    net.exitCode === EXIT.OK && detected >= 1 && (net.result?.warnings?.length ?? 0) >= 1,
    `exit=${net.exitCode} 감지=${detected} ${net.result?.warnings?.find((warning) => /네트워크/.test(warning)) ?? net.result?.reason ?? net.stderr}`
  );

  const temp = callWrapper("temp", ["start", "--role", "check", "--task", "11"], TEMP_PROMPT);
  const tempTests = String(temp.result?.report?.tests ?? "");
  const tmpDir = codexTmpDir(repo);
  const leftovers = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : [];
  record(
    "11. 임시 폴더",
    temp.exitCode === EXIT.OK &&
      /TD_OK/.test(tempTests) &&
      /MK_OK/.test(tempTests) &&
      /codex-tmp/i.test(tempTests) &&
      leftovers.length === 0 &&
      temp.result?.tempCleanup?.removed?.length === 0 &&
      (temp.result?.tempCleanup?.failed?.length ?? 0) === 0,
    `exit=${temp.exitCode} ${tempTests || temp.result?.reason || temp.stderr} 래퍼가 치운 항목=${temp.result?.tempCleanup?.removed?.length ?? "?"} 남은 항목=${leftovers.length}`
  );

  const usageFile = path.join(workspace, USAGE_FILE);
  const lines = fs.existsSync(usageFile)
    ? fs.readFileSync(usageFile, "utf8").split(/\r?\n/).filter(Boolean).map((raw) => JSON.parse(raw))
    : [];
  const okLines = lines.filter((item) => item.exitCode === EXIT.OK);
  const usageOk =
    okLines.length > 0 &&
    okLines.every((item) => item.tokens?.total_tokens > 0 && typeof item.weeklyEnd === "number" && typeof item.subagentCount === "number" && "subagentTokens" in item && "totalTokens" in item);
  record("8. 사용량 기록", usageOk, `기록 ${lines.length}줄, 성공 호출 ${okLines.length}줄, 하위 에이전트 합계 ${okLines.reduce((sum, item) => sum + (item.subagentCount ?? 0), 0)}개`);

  // 9번은 마지막에 한다: 래퍼가 중단 뒤 2분을 기다리며 바뀐 파일을 기록하므로 호출이 오래 걸린다.
  const late = callWrapper("timeout", ["start", "--role", "check", "--task", "9", "--timeout-min", "0.5"], TIMEOUT_PROMPT);
  const lateExists = fs.existsSync(path.join(repo, "late.txt"));
  const startedExists = fs.existsSync(path.join(repo, "started.txt"));
  const lateDetected = late.result?.lateChanges?.includes("late.txt") === true;
  const interrupted = late.result?.interrupt?.interrupted === true;
  const reason = String(late.result?.reason ?? "");
  // 명령이 실제로 시작됐고(started.txt) 감시가 끝까지 돌았을 때만 통과한다. late.txt가 없다는 것만으로는 아무것도 증명하지 못한다.
  record(
    "9. 시간 초과 중단",
    late.exitCode === EXIT.FAILED &&
      reason.includes("제한 시간") &&
      interrupted &&
      Array.isArray(late.result?.lateChanges) &&
      /바뀐 파일 \d+개/.test(reason) &&
      startedExists &&
      (lateDetected || !lateExists),
    `exit=${late.exitCode} 중단=${interrupted} started.txt=${startedExists ? "있음" : "없음"} late.txt=${lateExists ? "있음" : "없음"} 탐지=${lateDetected ? "예" : "아니오"} (중단된 명령이 계속 도는 것은 알려진 한계) ${reason || late.stderr}`
  );
}

// 10번: 이 임시 저장소용으로 뜬 Codex 브로커를 닫는다. 점검 세션의 폴더가 아니라서 Codex 플러그인이 대신 닫아 주지 않는다.
function closeBroker() {
  const shutdown = spawnSync(process.execPath, [wrapper, "shutdown", "--cwd", repo], { encoding: "utf8", timeout: 60_000 });
  const shutdownLine = (shutdown.stdout || shutdown.stderr || "").trim();
  record(
    "10. 브로커 정리",
    shutdown.status === EXIT.OK && /^codex-run shutdown stopped=true exited=true /m.test(shutdownLine),
    shutdownLine || `exit=${shutdown.status} ${shutdown.error?.message ?? ""}`.trim()
  );
}

main();
