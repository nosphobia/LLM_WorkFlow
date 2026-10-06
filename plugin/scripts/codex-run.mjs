#!/usr/bin/env node
// Codex 플러그인을 부르는 유일한 진입점. 쓰는 법은 plugin/skills/codex-planning/SKILL.md에 있다.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { defaultPaths, EXIT } from "./lib/pins.mjs";
import { parseCliArgs } from "./lib/cli-args.mjs";
import { collectEnvironmentProblems } from "./lib/environment.mjs";
import { listChangedFiles, commitFiles, buildSnapshot } from "./lib/git-changes.mjs";
import { findRolloutFile, summarizeTurn } from "./lib/rollout.mjs";
import { runWrapper } from "./lib/run.mjs";
import { shutdownBroker, isProcessAlive } from "./lib/broker.mjs";

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`codex-run: ${parsed.error}`);
  process.exit(EXIT.FAILED);
}
const { options } = parsed;
const paths = defaultPaths();

let codexLib = null;
async function loadCodexLib() {
  codexLib ??= await import(pathToFileURL(paths.codexLib).href);
  return codexLib;
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (options.action === "shutdown") {
  let broker;
  try {
    broker = await import(pathToFileURL(paths.codexBrokerLib).href);
  } catch (error) {
    console.error(`codex-run shutdown: Codex 플러그인의 브로커 라이브러리를 불러올 수 없습니다: ${error.message}`);
    process.exit(EXIT.ENVIRONMENT);
  }
  const result = await shutdownBroker(options.cwd, {
    loadBrokerSession: broker.loadBrokerSession,
    sendBrokerShutdown: broker.sendBrokerShutdown,
    teardownBrokerSession: broker.teardownBrokerSession,
    clearBrokerSession: broker.clearBrokerSession,
    isAlive: (pid) => isProcessAlive(pid),
    sleep,
    now: () => Date.now()
  });
  console.log(`codex-run shutdown stopped=${result.stopped} exited=${result.exited ?? "-"} pid=${result.pid ?? "-"} detail=${result.detail}`);
  // 브로커가 없으면 0, 닫고 종료까지 확인했으면 0, 그 밖(끝나지 않음, 확인 불가)은 3이다.
  const noBroker = !result.stopped && result.pid === null;
  process.exit(noBroker || result.exited === true ? EXIT.OK : EXIT.FAILED);
}

const deps = {
  now: () => Date.now(),
  readText,
  checkEnvironment: (repoDir) =>
    collectEnvironmentProblems({
      repoDir,
      paths,
      readText,
      fileExists: (file) => fs.existsSync(file),
      codexPluginList: () => execSync("codex plugin list", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    }),
  ensureWorkspace: (dir) => {
    fs.mkdirSync(dir, { recursive: true });
    const ignoreFile = path.join(options.cwd, ".superpowers", "sdd", ".gitignore");
    if (!fs.existsSync(ignoreFile)) fs.writeFileSync(ignoreFile, "*\n");
  },
  listChangedFiles,
  commitFiles,
  snapshotRepo: (cwd) =>
    buildSnapshot(listChangedFiles(cwd), (file) => {
      try {
        const stat = fs.statSync(path.join(cwd, file));
        return { mtimeMs: stat.mtimeMs, size: stat.size };
      } catch {
        return null;
      }
    }),
  sleep,
  runTurn: async ({ cwd, prompt, resumeThreadId, effort, model, onProgress }) => {
    const { runAppServerTurn } = await loadCodexLib();
    const result = await runAppServerTurn(cwd, {
      prompt,
      resumeThreadId,
      effort,
      model,
      onProgress,
      sandbox: "workspace-write",
      persistThread: true,
      threadName: `llm-workflow ${options.role ?? ""} ${options.task ?? ""}`.trim()
    });
    return {
      status: result.status,
      threadId: result.threadId,
      turnId: result.turnId,
      finalMessage: result.finalMessage,
      error: result.error ?? null
    };
  },
  interrupt: async ({ cwd, threadId, turnId }) => {
    const { interruptAppServerTurn } = await loadCodexLib();
    return interruptAppServerTurn(cwd, { threadId, turnId });
  },
  readTurnSummary: async (threadId, turnId) => {
    let summary = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const file = findRolloutFile(paths.codexSessions, threadId);
      if (file) {
        summary = summarizeTurn(fs.readFileSync(file, "utf8"), turnId);
        if (summary.completed) return summary;
      }
      await sleep(300);
    }
    return summary;
  },
  appendLine: (file, value) => fs.appendFileSync(file, `${JSON.stringify(value)}\n`),
  writeJson: (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  }
};

const { exitCode, summaryLine } = await runWrapper(options, deps);
console.log(summaryLine);
process.exit(exitCode);
