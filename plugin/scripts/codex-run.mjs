#!/usr/bin/env node
// Codex 플러그인을 부르는 유일한 진입점. 쓰는 법은 plugin/skills/codex-planning/SKILL.md에 있다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { defaultPaths, pluginPaths, EXIT } from "./lib/pins.mjs";
import { parseCliArgs } from "./lib/cli-args.mjs";
import { collectEnvironmentProblems } from "./lib/environment.mjs";
import { listChangedFiles, commitFiles, buildSnapshot } from "./lib/git-changes.mjs";
import { findRolloutFile, summarizeTurn } from "./lib/rollout.mjs";
import { runWrapper } from "./lib/run.mjs";
import { shutdownBroker, isProcessAlive } from "./lib/broker.mjs";
import { parseSettings } from "./lib/settings.mjs";
import { evaluateLimits, formatLimitLines } from "./lib/limits.mjs";
import { PROJECT_CONFIG_REL, buildProjectConfig, checkEffectiveConfig, codexTmpDir, findAppsTools } from "./lib/project-config.mjs";
import { emptyDirInside, listRootDirs } from "./lib/temp-cleanup.mjs";
import { assertSafePath, readExisting } from "./lib/safe-path.mjs";
import { snapshotProtected } from "./lib/protected.mjs";
import { findSubagents } from "./lib/subagents.mjs";
import { findWorkflowTrustEntries, formatTrustReport } from "./lib/trust.mjs";

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`codex-run: ${parsed.error}`);
  process.exit(EXIT.FAILED);
}
const { options } = parsed;
const paths = defaultPaths();
const plugin = pluginPaths();

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

// 공식 플러그인의 클라이언트로 브로커 없이 Codex 앱 서버를 잠깐 띄워 요청한다. 토큰을 쓰지 않는 요청만 한다.
const DIRECT_REQUEST_TIMEOUT_MS = 60_000;
async function withDirectClient(cwd, fn) {
  const { CodexAppServerClient } = await import(pathToFileURL(paths.codexAppServerLib).href);
  let timer;
  let timedOut = false;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("Codex 앱 서버 응답 시간 초과 (60초)"));
    }, DIRECT_REQUEST_TIMEOUT_MS);
  });
  // 연결이 시간 초과 뒤에야 끝나면 닫을 클라이언트가 늦게 생긴다. 그때 닫는다.
  const connecting = CodexAppServerClient.connect(cwd, { disableBroker: true });
  connecting.then(
    (late) => {
      if (timedOut) late.close().catch(() => {});
    },
    () => {}
  );
  let client = null;
  try {
    client = await Promise.race([connecting, timeout]);
    return await Promise.race([fn(client), timeout]);
  } finally {
    clearTimeout(timer);
    if (client) await client.close();
  }
}

// 대화 기록을 남기지 않는 대화 시작(토큰 없음). Codex는 이때 그 폴더를 신뢰 목록에 등록한다.
const startEphemeralThread = (client, cwd) =>
  client.request("thread/start", { cwd, approvalPolicy: "never", sandbox: "workspace-write", ephemeral: true, serviceName: "llm-workflow" });

const loadedSettings = parseSettings(readText(plugin.settingsFile) ?? "");
function requireSettings(label) {
  if (!loadedSettings.ok) {
    console.error(`${label}: ${loadedSettings.error} (${plugin.settingsFile})`);
    process.exit(EXIT.ENVIRONMENT);
  }
  return loadedSettings.settings;
}

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

if (options.action === "limits") {
  const settings = requireSettings("codex-run limits");
  let evaluation;
  try {
    const response = await withDirectClient(options.cwd, (client) => client.request("account/rateLimits/read", {}));
    evaluation = evaluateLimits(response, settings, { phase: options.phase, tasks: options.tasks });
  } catch (error) {
    evaluation = { status: "error", planType: null, reason: `한도를 읽지 못했습니다: ${error.message}`, windows: [] };
  }
  for (const line of formatLimitLines(evaluation)) console.log(line);
  process.exit(evaluation.status === "ok" ? EXIT.OK : evaluation.status === "short" ? EXIT.LIMIT : EXIT.ENVIRONMENT);
}

if (options.action === "trust-report") {
  let lines;
  try {
    const read = await withDirectClient(options.cwd, (client) => client.request("config/read", { includeLayers: false, cwd: options.cwd }));
    lines = formatTrustReport(findWorkflowTrustEntries(read?.config?.projects ?? {}, os.tmpdir(), (dir) => fs.existsSync(dir)));
  } catch (error) {
    console.error(`codex-run trust-report: 신뢰 목록을 읽지 못했습니다: ${error.message}`);
    process.exit(EXIT.ENVIRONMENT);
  }
  for (const line of lines) console.log(line);
  process.exit(EXIT.OK);
}

const settings = requireSettings("codex-run");
const configFile = path.join(options.cwd, PROJECT_CONFIG_REL);
const expectedConfig = { repoDir: options.cwd, shimDir: plugin.shimDir };

function isIgnored(cwd, rel) {
  try {
    execFileSync("git", ["-C", cwd, "check-ignore", "-q", "--", rel], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// .codex/가 git 무시 대상이 아니면 저장소별 무시 목록(.git/info/exclude)에 더한다. 추적 파일은 바꾸지 않는다.
// exclude는 git 공용 폴더 안의 실제 경로여야 한다. 읽기 실패를 빈 파일로 보고 덮어쓰지 않는다(검토 2 S2).
function ensureCodexIgnored() {
  if (isIgnored(options.cwd, ".codex/config.toml")) return null;
  const gitOut = (args) => execFileSync("git", ["-C", options.cwd, "rev-parse", ...args], { encoding: "utf8" }).trim();
  const exclude = path.resolve(options.cwd, gitOut(["--git-path", "info/exclude"]));
  assertSafePath(path.resolve(options.cwd, gitOut(["--git-common-dir"])), exclude);
  const current = readExisting(exclude) ?? "";
  if (current.split(/\r?\n/).some((line) => line.trim() === ".codex/")) return null;
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  fs.writeFileSync(exclude, `${current}${current && !current.endsWith("\n") ? "\n" : ""}.codex/\n`);
  return "`.codex/`가 git 무시 목록에 없어 .git/info/exclude에 더했습니다";
}

// 진행 기록 폴더의 .gitignore("*")를 없을 때만 쓴다. 저장소 안의 실제 경로인지 먼저 확인한다.
function ensureSddIgnore() {
  const sddIgnore = path.join(options.cwd, ".superpowers", "sdd", ".gitignore");
  const { exists } = assertSafePath(options.cwd, sddIgnore);
  fs.mkdirSync(path.dirname(sddIgnore), { recursive: true });
  if (!exists) fs.writeFileSync(sddIgnore, "*\n");
}

async function prepareProjectConfig() {
  const warnings = [];
  const problems = [];
  const text = buildProjectConfig(expectedConfig);
  try {
    const ignoreNote = ensureCodexIgnored();
    if (ignoreNote) warnings.push(ignoreNote);
    ensureSddIgnore();
    assertSafePath(options.cwd, codexTmpDir(options.cwd));
    fs.mkdirSync(codexTmpDir(options.cwd), { recursive: true });
    assertSafePath(options.cwd, configFile);
    const before = readExisting(configFile);
    if (before !== null && before !== text) warnings.push("프로젝트 Codex 설정을 다시 썼습니다(이전 내용과 달랐음)");
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    fs.writeFileSync(configFile, text);
  } catch (error) {
    problems.push(`프로젝트 Codex 설정을 준비하지 못했습니다: ${error.message}`);
    return { warnings, problems };
  }
  try {
    const checked = await withDirectClient(options.cwd, async (client) => {
      const read = async () => checkEffectiveConfig(await client.request("config/read", { includeLayers: true, cwd: options.cwd }), expectedConfig);
      let result = await read();
      if (result.projectDisabled) {
        // 그 폴더에서 Codex를 처음 쓰면 신뢰 등록 전이라 프로젝트 설정이 꺼져 있다. 토큰을 쓰지 않는 대화 시작으로 등록한다.
        await startEphemeralThread(client, options.cwd);
        result = await read();
      }
      return result;
    });
    problems.push(...checked.problems);
  } catch (error) {
    problems.push(`프로젝트 Codex 설정을 확인하지 못했습니다: ${error.message}`);
  }
  return { warnings, problems };
}

async function checkAppsTools() {
  try {
    const status = await withDirectClient(options.cwd, async (client) => {
      const started = await startEphemeralThread(client, options.cwd);
      return client.request("mcpServerStatus/list", { threadId: started.thread.id, detail: "toolsAndAuthOnly" });
    });
    const apps = findAppsTools(status);
    if (apps.present) return { problems: [`외부 연결 도구가 켜져 있습니다: codex_apps 도구 ${apps.tools.length}개`], toolCount: apps.tools.length };
    return { problems: [], toolCount: 0 };
  } catch (error) {
    return { problems: [`외부 연결 도구를 확인하지 못했습니다: ${error.message}`], toolCount: null };
  }
}

async function checkLimits() {
  try {
    const response = await withDirectClient(options.cwd, (client) => client.request("account/rateLimits/read", {}));
    return evaluateLimits(response, settings, { phase: "call" });
  } catch (error) {
    return { status: "error", reason: `한도를 읽지 못했습니다: ${error.message}` };
  }
}

const deps = {
  now: () => Date.now(),
  readText,
  settings,
  checkEnvironment: (repoDir) =>
    collectEnvironmentProblems({
      repoDir,
      paths,
      readText,
      fileExists: (file) => fs.existsSync(file),
      // 원격 마켓플레이스 목록 때문에 출력이 1MiB를 넘을 수 있다(2026-10-10 약 1.06MB).
      codexPluginList: () => execSync("codex plugin list", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, timeout: 120_000 })
    }),
  prepareProjectConfig,
  snapshotProtected: (cwd) => snapshotProtected(cwd, settings.protectedPaths),
  checkAppsTools,
  checkLimits,
  ensureWorkspace: (dir) => {
    assertSafePath(options.cwd, dir);
    fs.mkdirSync(dir, { recursive: true });
    ensureSddIgnore();
  },
  listChangedFiles,
  commitFiles,
  listRootDirs: (cwd) => listRootDirs(cwd),
  isIgnored: (cwd, rel) => isIgnored(cwd, rel),
  cleanupCodexTmp: () => emptyDirInside(options.cwd, codexTmpDir(options.cwd)),
  readSubagents: (threadId, sinceMs) => findSubagents(paths.codexSessions, threadId, sinceMs),
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
