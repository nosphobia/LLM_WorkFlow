#!/usr/bin/env node
// 마스터의 기계적인 일을 대신한다: 작업 지시 파일 만들기, Codex 지시문 채우기, 래퍼 호출과 결과 요약,
// 검수 지시 파일 만들기, 진행 기록 줄 쓰기. 쓰는 법은 plugin/skills/codex-execution/SKILL.md에 있다.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { defaultPaths, PLUGIN_ROOT, EXIT, DEFAULT_TIMEOUT_MIN } from "./lib/pins.mjs";
import {
  RUN_ROLES,
  fillCurly,
  fillSquare,
  leftoverCurly,
  planTaskName,
  planSpecPath,
  planSection,
  extractTemplatePrompt,
  wrotePath,
  fromBashPath,
  toRepoRelative,
  templateFor,
  runFiles,
  wrapperCall
} from "./lib/task-prompt.mjs";

const [command, ...rest] = process.argv.slice(2);

function fail(message) {
  console.error(`codex-task ${command ?? ""}: ${message}`);
  process.exit(EXIT.FAILED);
}

if (!["run", "review", "ledger"].includes(command)) fail("첫 인자는 run, review, ledger 중 하나여야 합니다");

let args;
try {
  ({ values: args } = parseArgs({
    args: rest,
    strict: true,
    options: {
      cwd: { type: "string" },
      plan: { type: "string" },
      role: { type: "string" },
      task: { type: "string" },
      round: { type: "string" },
      thread: { type: "string" },
      effort: { type: "string" },
      context: { type: "string" },
      findings: { type: "string" },
      diff: { type: "string" },
      "timeout-min": { type: "string" },
      "dry-run": { type: "boolean" },
      kind: { type: "string" },
      base: { type: "string" },
      model: { type: "string" },
      concerns: { type: "string" },
      text: { type: "string" },
      file: { type: "string" }
    }
  }));
} catch (error) {
  fail(error.message);
}
if (!args.cwd || !args.plan) fail("--cwd와 --plan이 필요합니다");
const positive = /^[1-9]\d*$/;
if (args.round !== undefined && !/^\d+$/.test(args.round)) fail("--round는 0 이상의 정수여야 합니다");
if (command === "run" && args.round === "0" && args.role !== "fix") fail("--round 0은 --role fix(우려 처리)에서만 쓴다");
if (args.task !== undefined && !positive.test(args.task) && !(command === "review" && args.kind === "rereview" && args.task === "final")) fail("--task는 1 이상의 정수여야 합니다");

let timeoutMin = DEFAULT_TIMEOUT_MIN;
if (args["timeout-min"] !== undefined) {
  timeoutMin = Number(args["timeout-min"]);
  if (!(timeoutMin > 0) || !Number.isFinite(timeoutMin)) fail("--timeout-min은 0보다 큰 수여야 합니다");
}

const repo = path.resolve(args.cwd);
const planFile = path.resolve(repo, args.plan);
if (!fs.existsSync(planFile)) fail(`계획 파일이 없습니다: ${planFile}`);
const planText = fs.readFileSync(planFile, "utf8");
const rel = (file) => toRepoRelative(repo, file);
const planRel = rel(planFile);
// 명세 경로를 읽지 못했을 때 "none"을 넘기면 Codex와 검수자가 명세 없이 일한다(2026-10-20 재측정). 그때는 멈춘다.
// 기록 줄(ledger)은 멈춤을 남길 수 있어야 하므로 막지 않는다.
const specPath = planSpecPath(planText);
if (command !== "ledger") {
  if (!specPath) fail(`계획 머리말에 \`**Spec:** \`<명세 경로>\`\` 줄이 없습니다: ${planRel}`);
  if (!fs.existsSync(path.resolve(repo, specPath))) fail(`계획 머리말의 명세 파일이 없습니다: ${specPath}`);
}
const sp = path.join(defaultPaths().superpowersRoot, "skills");
const execution = path.join(PLUGIN_ROOT, "skills", "codex-execution");
const git = (...gitArgs) => execFileSync("git", ["-C", repo, ...gitArgs], { encoding: "utf8" }).trim();

// Git Bash가 출력한 경로를 cygpath로 바꾼다. 실패하거나 비면 순수 함수로 대신한다.
function toWin(value) {
  if (!value) return value;
  try {
    const out = execFileSync("bash", ["-c", 'cygpath -w "$1"', "_", value], { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (out) return out;
  } catch {}
  return fromBashPath(value);
}

function bash(name, scriptArgs) {
  const proc = spawnSync("bash", [path.join(sp, "subagent-driven-development", "scripts", name), ...scriptArgs], {
    cwd: repo,
    encoding: "utf8",
    timeout: 120_000
  });
  if (proc.status !== 0) fail(`${name} 실패: ${(proc.stderr || proc.stdout || proc.error?.message || "").trim()}`);
  return proc.stdout;
}

if (args.findings && !fs.existsSync(path.resolve(repo, args.findings))) fail(`지적 파일이 없습니다: ${args.findings}`);
if (args.diff && !fs.existsSync(path.resolve(repo, args.diff))) fail(`검수 자료 파일이 없습니다: ${args.diff}`);

const workspaceOut = bash("sdd-workspace", [planRel]).trim().split(/\r?\n/).pop();
const workspace = toWin(workspaceOut);
{
  const base = path.win32.join(repo, ".superpowers", "sdd");
  if (!workspace || !path.win32.isAbsolute(workspace)) fail(`sdd-workspace가 절대 경로를 출력하지 않았습니다: "${workspaceOut}"`);
  const inside = path.win32.relative(base, workspace).toLowerCase();
  if (inside === "" || inside.startsWith("..") || path.win32.isAbsolute(inside)) fail(`sdd-workspace 경로가 ${base} 아래가 아닙니다: "${workspaceOut}"`);
}

function appendLedger(which, text) {
  const file = path.join(workspace, `${which}.md`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, which === "progress" ? `# SDD ledger — plan: ${planRel}\n` : `# 계획 단계 기록 — plan: ${planRel}\n`);
  fs.appendFileSync(file, `- ${String(text).replace(/\r?\n/g, " ")}\n`);
}

if (command === "ledger") {
  if (!args.text) fail("--text가 필요합니다");
  const which = args.file ?? "progress";
  if (!["progress", "planning"].includes(which)) fail("--file은 progress 또는 planning이어야 합니다");
  appendLedger(which, args.text);
  console.log(`codex-task ledger ${which}.md: ${args.text}`);
  process.exit(EXIT.OK);
}

if (command === "review") {
  const kind = args.kind;
  if (!["task", "rereview", "final"].includes(kind)) fail("--kind는 task, rereview, final 중 하나여야 합니다");
  if (!args.base) fail("--base가 필요합니다");
  if (kind !== "final" && !args.task) fail("--task가 필요합니다 (최종 수정 재검수는 --task final)");
  if (kind === "rereview" && !args.findings) fail("rereview에는 --findings가 필요합니다");
  const head = git("rev-parse", "HEAD");
  let commitCount = null;
  try {
    commitCount = Number(git("rev-list", "--count", `${args.base}..HEAD`));
  } catch {}
  let pkg;
  let packageOut = "";
  if (commitCount === 0) {
    // 수정에서 커밋이 없으면(반박) review-package가 빈 범위로 실패한다. 한 줄짜리 자료를 대신 만든다.
    const base7 = git("rev-parse", args.base).slice(0, 7);
    const head7 = head.slice(0, 7);
    pkg = path.join(workspace, `review-${base7}..${head7}-empty.diff`);
    fs.writeFileSync(pkg, `No new commits in ${base7}..${head7}. The implementer made no code change; judge each finding against the implementer's report (pushback or explanation).\n`);
  } else {
    packageOut = bash("review-package", [planRel, args.base, head]);
    pkg = toWin(wrotePath(packageOut));
  }
  if (!pkg || !path.win32.isAbsolute(pkg)) fail(`review-package 출력에서 검수 자료 경로를 찾지 못했습니다: "${packageOut.trim()}"`);
  const model = args.model ?? (kind === "final" ? "opus" : "sonnet");
  const constraints = planSection(planText, "Global Constraints") ?? "none";
  const template = (file) => extractTemplatePrompt(fs.readFileSync(path.join(sp, file), "utf8"));
  const inWorkspace = (name) => rel(path.join(workspace, name));
  let prompt;
  let name;
  if (kind === "task") {
    const additions = fs.readFileSync(path.join(execution, "review-additions.md"), "utf8");
    prompt = `${fillSquare(template("subagent-driven-development/task-reviewer-prompt.md"), {
      MODEL: model,
      BRIEF_FILE: inWorkspace(`task-${args.task}-brief.md`),
      GLOBAL_CONSTRAINTS: constraints,
      REPORT_FILE: inWorkspace(`task-${args.task}-report.md`),
      BASE_SHA: args.base,
      HEAD_SHA: head,
      DIFF_FILE: rel(pkg)
    })}\n\n${fillCurly(additions, { CONCERNS: args.concerns ?? "none" })}`;
    name = `task-${args.task}-review-prompt.md`;
  } else if (kind === "rereview") {
    const final = args.task === "final";
    prompt = fillSquare(template("subagent-driven-development/re-review-prompt.md"), {
      MODEL: model,
      BRIEF_FILE: inWorkspace(final ? "final-fix-findings.md" : `task-${args.task}-brief.md`),
      REPORT_FILE: inWorkspace(final ? "final-fix-report.md" : `task-${args.task}-report.md`),
      DIFF_FILE: rel(pkg),
      FINDINGS: fs.readFileSync(path.resolve(repo, args.findings), "utf8").trim(),
      FIX_BASE_SHA: args.base,
      HEAD_SHA: head
    });
    name = final ? "final-rereview-prompt.md" : `task-${args.task}-rereview-prompt.md`;
  } else {
    prompt = fillSquare(template("requesting-code-review/code-reviewer.md"), {
      DESCRIPTION: `Final whole-branch review of the implementation of ${planRel}`,
      PLAN_OR_REQUIREMENTS: [
        `Plan: ${planRel}`,
        `Spec: ${specPath}`,
        `Deferred and parked findings to weigh before merge: the lines containing "minor (deferred)" or "parked" in ${inWorkspace("progress.md")}`
      ].join("\n"),
      BASE_SHA: args.base,
      HEAD_SHA: head,
      SHA: head
    });
    name = "final-review-prompt.md";
  }
  const file = path.join(workspace, name);
  fs.writeFileSync(file, `${prompt}\n`);
  console.log(`codex-task review prompt=${rel(file)} package=${rel(pkg)} model=${model}`);
  console.log(`next: ${model} 검수 서브에이전트에 "Read ${rel(file)} and follow it exactly. You are read-only." 를 보낸다`);
  process.exit(EXIT.OK);
}

// command === "run"
const role = args.role;
if (!RUN_ROLES.includes(role)) fail(`--role은 ${RUN_ROLES.join(", ")} 중 하나여야 합니다`);
const task = role === "final-fix" ? null : args.task;
if (role !== "final-fix" && !/^\d+$/.test(task ?? "")) fail("--task가 필요합니다");
const round = args.round === undefined ? null : Number(args.round);
const required = { implement: [], fix: ["round", "findings", "thread"], handoff: ["round", "diff"], "final-fix": ["findings", "diff"] }[role];
for (const key of required) if (args[key] === undefined) fail(`${role}에는 --${key}가 필요합니다`);

let brief = path.join(workspace, `task-${task}-brief.md`);
if (role === "implement") {
  const briefOut = bash("task-brief", [planRel, task]);
  brief = toWin(wrotePath(briefOut));
  if (!brief || !path.win32.isAbsolute(brief)) fail(`task-brief 출력에서 작업 지시 파일 경로를 찾지 못했습니다: "${briefOut.trim()}"`);
}
const files = runFiles({ role, task, round });
const values = {
  TASK_NUMBER: task ?? "",
  TASK_NAME: (task && planTaskName(planText, task)) ?? "",
  BRIEF_PATH: brief ? rel(brief) : "",
  SPEC_PATH: specPath,
  PLAN_PATH: planRel,
  CONTEXT: args.context ? fs.readFileSync(path.resolve(repo, args.context), "utf8").trim() : "none",
  GLOBAL_CONSTRAINTS: planSection(planText, "Global Constraints") ?? "none",
  REPORT_PATH: rel(path.join(workspace, files.report)),
  FINDINGS_PATH: args.findings ? rel(path.resolve(repo, args.findings)) : "",
  ROUNDS_SO_FAR: String(Math.max(0, (round ?? 1) - 1)),
  FINDINGS_HISTORY_PATH: rel(path.join(workspace, `task-${task}-findings-history.md`)),
  DIFF_PATH: args.diff ? rel(path.resolve(repo, args.diff)) : ""
};
const promptTemplate = fs.readFileSync(path.join(execution, templateFor(role)), "utf8");
const left = leftoverCurly(promptTemplate).filter((key) => !(key in values));
if (left.length > 0) fail(`지시문에 채우지 못한 자리표시자가 있습니다: ${left.join(", ")}`);
const prompt = fillCurly(promptTemplate, values);
const promptFile = path.join(workspace, files.prompt);
fs.writeFileSync(promptFile, prompt);

const head = git("rev-parse", "HEAD");
const call = wrapperCall({ role, thread: args.thread, round });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.join(workspace, "codex-results", `${stamp}-${call.role}${task ? `-t${task}` : ""}.json`);
// LLM_WORKFLOW_CODEX_RUN_SCRIPT는 시험에서 가짜 래퍼로 바꿔 끼우기 위한 것이다.
const wrapperScript = process.env.LLM_WORKFLOW_CODEX_RUN_SCRIPT || path.join(PLUGIN_ROOT, "scripts", "codex-run.mjs");
const wrapperArgs = [wrapperScript, call.action, "--cwd", repo, "--prompt-file", promptFile, "--workspace", workspace, "--role", call.role, "--out", out];
if (task) wrapperArgs.push("--task", task);
if (call.round !== null) wrapperArgs.push("--round", String(call.round));
if (args.thread) wrapperArgs.push("--thread", args.thread);
if (args.effort) wrapperArgs.push("--effort", args.effort);
if (args["timeout-min"]) wrapperArgs.push("--timeout-min", args["timeout-min"]);

if (args["dry-run"]) {
  console.log(`codex-task run dry-run prompt=${rel(promptFile)} head=${head.slice(0, 7)}`);
  console.log(`wrapper: node ${wrapperArgs.map((value) => (/\s/.test(value) ? `"${value}"` : value)).join(" ")}`);
  process.exit(EXIT.OK);
}

if (role === "implement" && !args.thread) appendLedger("progress", `Task ${task}: base ${head.slice(0, 7)}`);
// 래퍼 한 번은 최대 3턴(첫 턴, 형식 보정, 불일치 보정)이고 턴마다 제한 시간과 중단 뒤 2분 감시가 있다. 그보다 길게 기다린다.
const proc = spawnSync(process.execPath, wrapperArgs, { cwd: repo, encoding: "utf8", timeout: Math.ceil(3 * timeoutMin + 10) * 60_000 });
const exitCode = proc.status ?? EXIT.FAILED;
let result = null;
let resultError = null;
if (!fs.existsSync(out)) resultError = `래퍼가 결과 파일을 만들지 않았습니다: ${out}`;
else {
  try {
    result = JSON.parse(fs.readFileSync(out, "utf8"));
  } catch (error) {
    resultError = `래퍼 결과 파일을 읽지 못했습니다: ${out} (${error.message})`;
  }
}

const label = role === "final-fix" ? "Final fix" : `Task ${task}`;
const roleNote = role === "implement" ? "" : role === "final-fix" ? "" : ` (${role} round ${call.round})`;
appendLedger(
  "progress",
  `${label}: codex thread ${result?.threadId ?? "-"}${roleNote} — exit ${exitCode} ${result?.status ?? "-"}, commit ${result?.commit ?? "-"}, tokens ${result?.usage?.totalTokens?.total_tokens ?? "-"}, subagents ${result?.usage?.subagentCount ?? "-"}`
);
for (const item of result?.networkCommands ?? []) appendLedger("progress", `네트워크 경고: ${item.command}`);
for (const item of result?.riskyCommands ?? []) appendLedger("progress", `위험 명령 경고: ${item.matches.join(", ")}: ${item.command}`);
if ((result?.subagents ?? []).length > 0) appendLedger("progress", `하위 에이전트 경고: ${result.threadId} ${result.subagents.length}개`);
for (const warning of result?.warnings ?? []) {
  if (/^(네트워크 명령 감지|위험 명령 감지|하위 에이전트 \d+개)/.test(warning)) continue;
  appendLedger("progress", `래퍼 경고: ${warning}`);
}

console.log(
  `codex-task run exit=${exitCode} status=${result?.status ?? "-"} thread=${result?.threadId ?? "-"} commit=${result?.commit ?? "-"} tokens=${result?.usage?.totalTokens?.total_tokens ?? "-"} subagents=${result?.usage?.subagentCount ?? "-"}`
);
console.log(`reason: ${result?.reason ?? ((proc.stdout || proc.stderr || proc.error?.message || "").trim() || "-")}`);
if (result?.report) {
  console.log(`tests: ${result.report.tests ?? "-"}`);
  console.log(`concerns: ${result.report.concerns ?? "none"}`);
}
for (const warning of result?.warnings ?? []) console.log(`warning: ${warning}`);
let next;
if (exitCode === EXIT.OK && role === "implement") {
  next = args.thread
    ? `검수로: codex-task review --kind task --task ${task} --base <진행 기록의 "Task ${task}: base" 값>`
    : `검수로: codex-task review --kind task --task ${task} --base ${head.slice(0, 7)}`;
} else if (exitCode === EXIT.OK && role === "final-fix") {
  next = `재검수로: codex-task review --kind rereview --task final --base ${head.slice(0, 7)} --findings <final-fix-findings.md>`;
} else if (exitCode === EXIT.OK && role === "fix" && round === 0) {
  next = `검수로: codex-task review --kind task --task ${task} --base <진행 기록의 "Task ${task}: base" 값>`;
} else if (exitCode === EXIT.OK) {
  next = `재검수로: codex-task review --kind rereview --task ${task} --base ${head.slice(0, 7)} --findings ${args.findings ?? "<지적 파일>"}`;
} else if (exitCode === EXIT.STOPPED) {
  next = "Codex가 멈췄다(NEEDS_CONTEXT 또는 BLOCKED): 스킬의 'Codex가 멈췄을 때'를 따른다";
} else {
  next = "멈추고 보고한다: progress.md에 '멈춤:' 줄을 쓰고 사용자에게 알린다(스킬 참고)";
}
if (result?.status === "DONE_WITH_CONCERNS") next = `우려를 먼저 읽는다. ${next}`;
console.log(`next: ${next}`);
if (resultError) {
  console.error(`codex-task run: ${resultError}`);
  process.exit(exitCode !== 0 ? exitCode : EXIT.FAILED);
}
process.exit(exitCode);
