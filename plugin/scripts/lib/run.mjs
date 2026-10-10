// 래퍼의 처리 순서. Codex 호출, git, 파일 입출력은 deps로 받아 테스트에서 바꿔 끼운다.
import path from "node:path";
import { EXIT, USAGE_FILE } from "./pins.mjs";
import { parseReport, isDone, buildFormatCorrection, buildMismatchCorrection } from "./report.mjs";
import { compareChangedFiles, buildCommitMessage, diffSnapshots } from "./git-changes.mjs";
import { findNetworkCommands } from "./network.mjs";
import { findRiskyCommands } from "./risky.mjs";
import { findProtectedChanges } from "./protected.mjs";
import { suspiciousNewDirs } from "./temp-cleanup.mjs";
import { withCommonRules } from "./common-rules.mjs";
import { isLimitError, weeklyPercent } from "./rollout.mjs";
import { sumTokens } from "./usage.mjs";

const CONFIG_TAMPERED = "보호 파일 변경: .codex/config.toml";

export async function runWrapper(options, deps) {
  const startedAt = deps.now();
  const state = {
    threadId: options.threadId ?? null,
    turns: [],
    corrections: 0,
    formatCorrections: 0,
    mismatchCorrections: 0,
    transientError: null,
    networkCommands: [],
    lateChanges: null,
    report: null,
    commit: null,
    warnings: [],
    codexRan: false,
    rootBefore: [],
    subagents: [],
    riskyCommands: [],
    tempCleanup: null,
    newRootDirs: [],
    protectedChanges: []
  };
  const finish = (exitCode, reason) => finalize(options, deps, state, startedAt, exitCode, reason);

  try {
    const problems = deps.checkEnvironment(options.cwd);
    if (problems.length > 0) return finish(EXIT.ENVIRONMENT, problems.join("; "));

    // 래퍼가 관리하는 프로젝트 Codex 설정을 쓰고, Codex가 그 설정을 쓰는지 토큰 없이 확인한다.
    const prepared = await deps.prepareProjectConfig();
    state.warnings.push(...(prepared.warnings ?? []));
    if (prepared.problems.length > 0) return finish(EXIT.ENVIRONMENT, prepared.problems.join("; "));

    if (options.action === "check") {
      const apps = await deps.checkAppsTools();
      if (apps.problems.length > 0) return finish(EXIT.ENVIRONMENT, apps.problems.join("; "));
      return finish(EXIT.OK, `환경 점검 통과 (외부 연결 도구 ${apps.toolCount}개)`);
    }

    const prompt = deps.readText(options.promptFile);
    if (!prompt) return finish(EXIT.FAILED, `지시 파일을 읽을 수 없습니다: ${options.promptFile}`);
    deps.ensureWorkspace(options.workspace);
    if (options.action === "start") {
      const dirty = deps.listChangedFiles(options.cwd);
      if (dirty.length > 0) return finish(EXIT.FAILED, `새 대화를 시작하기 전에 커밋되지 않은 변경이 있습니다: ${dirty.join(", ")}`);
    }

    // 호출 전 한도 확인: 호출 도중 한도에 걸려 작업이 반쯤 남는 일을 막는다.
    const limits = await deps.checkLimits();
    if (limits.status === "short") return finish(EXIT.LIMIT, `한도 부족(호출 전 확인): ${limits.reason}`);
    if (limits.status !== "ok") return finish(EXIT.ENVIRONMENT, `한도 확인 실패: ${limits.reason}`);

    state.rootBefore = deps.listRootDirs(options.cwd);
    state.codexRan = true;
    // .codex/config.toml은 git이 무시하므로 git 대조로는 바뀐 것을 알 수 없다. 해시로 따로 확인한다.
    const configChanged = () => deps.projectConfigHash() !== prepared.hash;

    const first = await runTurn(withCommonRules(prompt, deps.settings.protectedPaths), options.action === "resume" ? options.threadId : null);
    if (configChanged()) return finish(EXIT.FAILED, CONFIG_TAMPERED);
    if (first.exit !== null) return finish(first.exit, first.reason);
    if (options.action === "resume" && first.threadId !== options.threadId) {
      return finish(EXIT.FAILED, `이어간 대화 ID가 다릅니다: 요청 ${options.threadId}, 응답 ${first.threadId}`);
    }

    let report = parseReport(first.finalMessage);
    if (!report.ok) {
      state.corrections += 1;
      state.formatCorrections += 1;
      const again = await runTurn(buildFormatCorrection(report.error), state.threadId);
      if (configChanged()) return finish(EXIT.FAILED, CONFIG_TAMPERED);
      if (again.exit !== null) return finish(again.exit, again.reason);
      report = parseReport(again.finalMessage);
      if (!report.ok) return finish(EXIT.FAILED, `형식 위반 정정 실패: ${report.error}`);
    }
    state.report = report;
    if (!isDone(report.status)) return finish(EXIT.STOPPED, `Codex 보고: ${report.status}`);

    let comparison = compareChangedFiles(report.changedFiles, deps.listChangedFiles(options.cwd));
    if (!comparison.match) {
      state.corrections += 1;
      state.mismatchCorrections += 1;
      const again = await runTurn(buildMismatchCorrection(comparison), state.threadId);
      if (configChanged()) return finish(EXIT.FAILED, CONFIG_TAMPERED);
      if (again.exit !== null) return finish(again.exit, again.reason);
      report = parseReport(again.finalMessage);
      if (!report.ok) return finish(EXIT.FAILED, `보고 불일치 정정 뒤 형식 위반: ${report.error}`);
      state.report = report;
      if (!isDone(report.status)) return finish(EXIT.STOPPED, `Codex 보고: ${report.status}`);
      comparison = compareChangedFiles(report.changedFiles, deps.listChangedFiles(options.cwd));
      if (!comparison.match) {
        const missing = comparison.missing.join(", ") || "없음";
        const extra = comparison.extra.join(", ") || "없음";
        return finish(EXIT.FAILED, `보고와 실제 변경이 다릅니다 (보고에만 있음: ${missing} / 실제에만 있음: ${extra})`);
      }
    }

    // 보호 경로는 보고 여부와 상관없이 git이 보는 모든 변경과 대조한다. 걸리면 커밋하지 않고 변경은 그대로 둔다.
    const protectedHits = findProtectedChanges(deps.listChangedFiles(options.cwd), deps.settings.protectedPaths);
    if (protectedHits.length > 0) {
      state.protectedChanges = protectedHits;
      return finish(EXIT.FAILED, `보호 경로 변경: ${protectedHits.join(", ")}`);
    }

    if (report.changedFiles.length > 0) {
      const model = [...state.turns].reverse().find((turn) => turn.model)?.model ?? null;
      state.commit = deps.commitFiles(options.cwd, report.changedFiles, buildCommitMessage(report.commitMessage, model));
    }
    return finish(EXIT.OK, `Codex 보고: ${report.status}`);
  } catch (error) {
    return finish(EXIT.FAILED, `예상하지 못한 오류: ${error?.message ?? error}`);
  }

  async function runTurn(text, resumeThreadId) {
    const ids = { threadId: resumeThreadId, turnId: null };
    const onProgress = (event) => {
      if (event && typeof event === "object") {
        if (event.threadId) ids.threadId = event.threadId;
        if (event.turnId) ids.turnId = event.turnId;
      }
    };
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), options.timeoutMin * 60_000);
    });
    let outcome;
    try {
      const pending = Promise.resolve(
        deps.runTurn({ cwd: options.cwd, prompt: text, resumeThreadId, effort: options.effort, model: options.model, onProgress })
      );
      pending.catch(() => {});
      outcome = await Promise.race([pending, timeout]);
    } catch (error) {
      outcome = { thrown: true, status: 1, error: { message: String(error?.message ?? error) } };
    } finally {
      clearTimeout(timer);
    }
    if (outcome.timedOut) {
      if (ids.threadId) state.threadId = ids.threadId;
      state.interrupt = await requestInterrupt(deps, { cwd: options.cwd, threadId: ids.threadId, turnId: ids.turnId });
      // Windows에서는 Codex가 띄운 명령이 중단 뒤에도 계속 돌 수 있어, 잠시 기다린 뒤 바뀐 파일을 기록한다.
      const watchMs = deps.postTimeoutWatchMs ?? 120_000;
      let watchNote;
      try {
        const before = deps.snapshotRepo(options.cwd);
        await deps.sleep(watchMs);
        const after = deps.snapshotRepo(options.cwd);
        state.lateChanges = diffSnapshots(before, after);
        watchNote = `중단 뒤 ${Math.round(watchMs / 1000)}초 동안 바뀐 파일 ${state.lateChanges.length}개`;
      } catch (error) {
        watchNote = `중단 뒤 변경 확인 실패: ${error?.message ?? error}`;
      }
      outcome = {
        timedOut: true,
        status: 1,
        threadId: ids.threadId,
        turnId: ids.turnId,
        error: { message: `제한 시간 ${options.timeoutMin}분 초과 (중단 ${state.interrupt.interrupted ? "성공" : "실패"}: ${state.interrupt.detail ?? "-"}); ${watchNote}` }
      };
    }

    const threadId = outcome.threadId ?? ids.threadId ?? null;
    const turnId = outcome.turnId ?? ids.turnId ?? null;
    if (threadId) state.threadId = threadId;
    const summary = threadId && turnId ? await deps.readTurnSummary(threadId, turnId) : null;
    for (const found of findNetworkCommands(summary?.commands ?? [])) state.networkCommands.push({ ...found, turnId });
    state.turns.push({
      turnId,
      model: summary?.model ?? null,
      tokens: summary?.tokens ?? null,
      commands: summary?.commands ?? [],
      weeklyStart: weeklyPercent(summary?.rateLimitsStart),
      weeklyEnd: weeklyPercent(summary?.rateLimitsEnd)
    });

    const failed = Boolean(outcome.timedOut || outcome.thrown) || outcome.status !== 0;
    if (!failed) {
      // 재연결처럼 Codex가 재시도한 오류는 차례가 정상으로 끝났으면 실패가 아니다. 결과에만 남긴다.
      if (outcome.error) state.transientError = String(outcome.error.message ?? outcome.error);
      return { exit: null, threadId, finalMessage: outcome.finalMessage ?? "" };
    }
    const error = outcome.error ?? summary?.error ?? null;
    if (!outcome.timedOut && (summary?.limitReached || isLimitError(outcome.error) || isLimitError(summary?.error))) {
      return { exit: EXIT.LIMIT, reason: `한도 도달: ${error?.message ?? "세션 기록의 한도 정보"}` };
    }
    return { exit: EXIT.FAILED, reason: `Codex 호출 실패: ${error?.message ?? `status ${outcome.status}`}` };
  }
}

// 중단 요청은 응답이 없거나 예외를 던져도 제한 시간 결과를 잃지 않도록 시간 상한을 두고 결과를 항상 돌려준다.
async function requestInterrupt(deps, request) {
  let timer;
  const limit = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ attempted: true, interrupted: false, detail: "중단 요청 시간 초과" }), deps.interruptTimeoutMs ?? 30_000);
  });
  try {
    const pending = Promise.resolve(deps.interrupt(request));
    pending.catch(() => {});
    const result = await Promise.race([pending, limit]);
    return result ?? { attempted: true, interrupted: false, detail: "중단 결과 없음" };
  } catch (error) {
    return { attempted: true, interrupted: false, detail: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

// Codex를 부른 뒤에는 종료 코드와 상관없이 하위 에이전트, 위험 명령, 임시 폴더, 보호 경로, 새 폴더를 확인한다.
// 확인이 실패해도 결과는 잃지 않고 경고로 남긴다.
function inspectAfterCodex(options, deps, state, startedAt) {
  try {
    const found = state.threadId ? deps.readSubagents(state.threadId, startedAt) : [];
    state.subagents = Array.isArray(found) ? found.filter(Boolean) : [];
  } catch (error) {
    state.warnings.push(`하위 에이전트 확인 실패: ${error?.message ?? error}`);
  }
  for (const child of state.subagents) {
    for (const found of findNetworkCommands(child.commands ?? [])) state.networkCommands.push({ ...found, turnId: null, subagent: child.threadId });
  }
  state.riskyCommands = findRiskyCommands([...state.turns.flatMap((turn) => turn.commands), ...state.subagents.flatMap((child) => child.commands ?? [])]);
  try {
    state.tempCleanup = deps.cleanupCodexTmp();
  } catch (error) {
    state.warnings.push(`임시 폴더 정리 실패: ${error?.message ?? error}`);
  }
  try {
    const changed = deps.listChangedFiles(options.cwd);
    if (state.protectedChanges.length === 0) state.protectedChanges = findProtectedChanges(changed, deps.settings.protectedPaths);
    state.newRootDirs = suspiciousNewDirs(state.rootBefore, deps.listRootDirs(options.cwd), changed, (name) => deps.isIgnored(options.cwd, name));
  } catch (error) {
    state.warnings.push(`호출 뒤 저장소 확인 실패: ${error?.message ?? error}`);
  }
}

function buildWarnings(state) {
  const warnings = [...state.warnings];
  for (const item of state.networkCommands) warnings.push(`네트워크 명령 감지 (${item.matches.join(", ")}): ${item.command}`);
  for (const item of state.riskyCommands) warnings.push(`위험 명령 감지 (${item.matches.join(", ")}): ${item.command}`);
  if (state.subagents.length > 0) warnings.push(`하위 에이전트 ${state.subagents.length}개: ${state.subagents.map((child) => child.threadId).join(", ")}`);
  if (state.tempCleanup?.removed?.length > 0) warnings.push(`남은 임시 항목 ${state.tempCleanup.removed.length}개 정리: ${state.tempCleanup.removed.join(", ")}`);
  if (state.tempCleanup?.failed?.length > 0) warnings.push(`임시 항목 정리 실패: ${state.tempCleanup.failed.join(", ")}`);
  if (state.newRootDirs.length > 0) warnings.push(`저장소 최상위에 git에 보이지 않는 새 폴더: ${state.newRootDirs.join(", ")}`);
  if (state.protectedChanges.length > 0) warnings.push(`보호 경로 변경(커밋 안 함): ${state.protectedChanges.join(", ")}`);
  if (state.lateChanges?.length > 0) warnings.push(`중단 뒤 바뀐 파일: ${state.lateChanges.join(", ")}`);
  return warnings;
}

function finalize(options, deps, state, startedAt, exitCode, reason) {
  if (state.codexRan) inspectAfterCodex(options, deps, state, startedAt);
  if (exitCode === EXIT.STOPPED && state.protectedChanges.length > 0) {
    exitCode = EXIT.FAILED;
    reason = `보호 경로 변경: ${state.protectedChanges.join(", ")}`;
  }
  const finishedAt = deps.now();
  const mainTokens = sumTokens(state.turns.map((turn) => turn.tokens));
  const subagentTokens = sumTokens(state.subagents.map((child) => child.tokens));
  const usage = {
    tokens: mainTokens,
    subagentCount: state.subagents.length,
    subagentTokens,
    totalTokens: sumTokens([mainTokens, subagentTokens]),
    weeklyStart: state.turns.find((turn) => turn.weeklyStart !== null)?.weeklyStart ?? null,
    weeklyEnd: [...state.turns].reverse().find((turn) => turn.weeklyEnd !== null)?.weeklyEnd ?? null,
    models: [...new Set(state.turns.map((turn) => turn.model).filter(Boolean))]
  };
  const result = {
    exitCode,
    reason,
    action: options.action,
    role: options.role ?? null,
    task: options.task ?? null,
    round: options.round ?? null,
    threadId: state.threadId,
    turnIds: state.turns.map((turn) => turn.turnId),
    status: state.report?.status ?? null,
    report: state.report,
    commit: state.commit,
    corrections: state.corrections,
    formatCorrections: state.formatCorrections,
    mismatchCorrections: state.mismatchCorrections,
    transientError: state.transientError,
    networkCommands: state.networkCommands,
    riskyCommands: state.riskyCommands,
    subagents: state.subagents.map(({ threadId, tokens }) => ({ threadId, tokens })),
    tempCleanup: state.tempCleanup,
    newRootDirs: state.newRootDirs,
    protectedChanges: state.protectedChanges,
    lateChanges: state.lateChanges,
    warnings: buildWarnings(state),
    interrupt: state.interrupt ?? null,
    durationSec: Math.round((finishedAt - startedAt) / 1000),
    usage,
    finishedAt: new Date(finishedAt).toISOString()
  };
  if (options.action !== "check") {
    try {
      deps.writeJson(options.out, result);
    } catch (error) {
      result.reason += ` (결과 기록 실패: ${error?.message ?? error})`;
    }
    if (state.turns.length > 0) {
      try {
        deps.appendLine(path.join(options.workspace, USAGE_FILE), {
          time: result.finishedAt,
          action: result.action,
          role: result.role,
          task: result.task,
          round: result.round,
          threadId: result.threadId,
          exitCode,
          status: result.status,
          corrections: result.corrections,
          formatCorrections: result.formatCorrections,
          mismatchCorrections: result.mismatchCorrections,
          networkCommands: result.networkCommands.length,
          riskyCommands: result.riskyCommands.length,
          lateChanges: result.lateChanges?.length ?? null,
          durationSec: result.durationSec,
          models: usage.models,
          tokens: usage.tokens,
          subagentCount: usage.subagentCount,
          subagentTokens: usage.subagentTokens,
          totalTokens: usage.totalTokens,
          weeklyStart: usage.weeklyStart,
          weeklyEnd: usage.weeklyEnd
        });
      } catch (error) {
        result.reason += ` (결과 기록 실패: ${error?.message ?? error})`;
      }
    }
  }
  let summaryLine = formatSummary(result, options.out);
  if (options.action === "check") for (const warning of result.warnings) summaryLine += `\nwarning: ${warning}`;
  return { exitCode, result, summaryLine };
}

export function formatSummary(result, out) {
  const weekly = `${result.usage.weeklyStart ?? "-"}%->${result.usage.weeklyEnd ?? "-"}%`;
  return [
    `codex-run exit=${result.exitCode}`,
    `status=${result.status ?? "-"}`,
    `thread=${result.threadId ?? "-"}`,
    `commit=${result.commit ?? "-"}`,
    `corrections=${result.corrections}`,
    `warnings=${result.warnings.length}`,
    `tokens=${result.usage.totalTokens?.total_tokens ?? "-"}`,
    `weekly=${weekly}`,
    `subagents=${result.usage.subagentCount}`,
    `result=${out ?? "-"}`,
    `reason=${result.reason}`
  ].join(" ");
}
