// 래퍼의 처리 순서. Codex 호출, git, 파일 입출력은 deps로 받아 테스트에서 바꿔 끼운다.
import path from "node:path";
import { EXIT, USAGE_FILE } from "./pins.mjs";
import { parseReport, isDone, buildFormatCorrection, buildMismatchCorrection } from "./report.mjs";
import { compareChangedFiles, buildCommitMessage } from "./git-changes.mjs";
import { isLimitError, weeklyPercent } from "./rollout.mjs";
import { sumTokens } from "./usage.mjs";

export async function runWrapper(options, deps) {
  const startedAt = deps.now();
  const state = { threadId: options.threadId ?? null, turns: [], corrections: 0, transientError: null, report: null, commit: null };
  const finish = (exitCode, reason) => finalize(options, deps, state, startedAt, exitCode, reason);

  try {
    const problems = deps.checkEnvironment(options.cwd);
    if (problems.length > 0) return finish(EXIT.ENVIRONMENT, problems.join("; "));
    if (options.action === "check") return finish(EXIT.OK, "환경 점검 통과");

    const prompt = deps.readText(options.promptFile);
    if (!prompt) return finish(EXIT.FAILED, `지시 파일을 읽을 수 없습니다: ${options.promptFile}`);
    deps.ensureWorkspace(options.workspace);
    if (options.action === "start") {
      const dirty = deps.listChangedFiles(options.cwd);
      if (dirty.length > 0) return finish(EXIT.FAILED, `새 대화를 시작하기 전에 커밋되지 않은 변경이 있습니다: ${dirty.join(", ")}`);
    }

    const first = await runTurn(prompt, options.action === "resume" ? options.threadId : null);
    if (first.exit !== null) return finish(first.exit, first.reason);
    if (options.action === "resume" && first.threadId !== options.threadId) {
      return finish(EXIT.FAILED, `이어간 대화 ID가 다릅니다: 요청 ${options.threadId}, 응답 ${first.threadId}`);
    }

    let report = parseReport(first.finalMessage);
    if (!report.ok) {
      state.corrections += 1;
      const again = await runTurn(buildFormatCorrection(report.error), state.threadId);
      if (again.exit !== null) return finish(again.exit, again.reason);
      report = parseReport(again.finalMessage);
      if (!report.ok) return finish(EXIT.FAILED, `형식 위반 정정 실패: ${report.error}`);
    }
    state.report = report;
    if (!isDone(report.status)) return finish(EXIT.STOPPED, `Codex 보고: ${report.status}`);

    let comparison = compareChangedFiles(report.changedFiles, deps.listChangedFiles(options.cwd));
    if (!comparison.match) {
      state.corrections += 1;
      const again = await runTurn(buildMismatchCorrection(comparison), state.threadId);
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
      await deps.interrupt({ cwd: options.cwd, threadId: ids.threadId, turnId: ids.turnId });
      outcome = { timedOut: true, status: 1, error: { message: `제한 시간 ${options.timeoutMin}분 초과` } };
    }

    const threadId = outcome.threadId ?? ids.threadId ?? null;
    const turnId = outcome.turnId ?? ids.turnId ?? null;
    if (threadId) state.threadId = threadId;
    const summary = threadId && turnId ? await deps.readTurnSummary(threadId, turnId) : null;
    state.turns.push({
      turnId,
      model: summary?.model ?? null,
      tokens: summary?.tokens ?? null,
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

function finalize(options, deps, state, startedAt, exitCode, reason) {
  const finishedAt = deps.now();
  const usage = {
    tokens: sumTokens(state.turns.map((turn) => turn.tokens)),
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
    transientError: state.transientError,
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
          durationSec: result.durationSec,
          models: usage.models,
          tokens: usage.tokens,
          weeklyStart: usage.weeklyStart,
          weeklyEnd: usage.weeklyEnd
        });
      } catch (error) {
        result.reason += ` (결과 기록 실패: ${error?.message ?? error})`;
      }
    }
  }
  return { exitCode, result, summaryLine: formatSummary(result, options.out) };
}

export function formatSummary(result, out) {
  const weekly = `${result.usage.weeklyStart ?? "-"}%->${result.usage.weeklyEnd ?? "-"}%`;
  return [
    `codex-run exit=${result.exitCode}`,
    `status=${result.status ?? "-"}`,
    `thread=${result.threadId ?? "-"}`,
    `commit=${result.commit ?? "-"}`,
    `corrections=${result.corrections}`,
    `tokens=${result.usage.tokens?.total_tokens ?? "-"}`,
    `weekly=${weekly}`,
    `result=${out ?? "-"}`,
    `reason=${result.reason}`
  ].join(" ");
}
