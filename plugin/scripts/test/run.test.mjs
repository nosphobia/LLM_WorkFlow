import test from "node:test";
import assert from "node:assert/strict";
import { runWrapper } from "../lib/run.mjs";
import { EXIT } from "../lib/pins.mjs";

const DONE = (files = "greet.py, tests/test_greet.py", message = "feat: 작별 인사 추가") =>
  `작업을 마쳤습니다.\nSTATUS: DONE\nCHANGED_FILES: ${files}\nCOMMIT_MESSAGE: ${message}\nTESTS: python -m unittest — OK\nCONCERNS: none`;

const SUMMARY = {
  found: true,
  completed: true,
  model: "gpt-test",
  effort: "high",
  tokens: { input_tokens: 10, cached_input_tokens: 5, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 12 },
  rateLimitsStart: { secondary: { window_minutes: 10080, used_percent: 12 } },
  rateLimitsEnd: { secondary: { window_minutes: 10080, used_percent: 13 } },
  limitReached: false,
  error: null
};

function setup({ replies = [DONE()], changed = [[], ["greet.py", "tests/test_greet.py"]], options = {}, deps = {} } = {}) {
  const calls = { runTurn: [], commit: [], interrupt: [], lines: [], json: [] };
  const changedQueue = [...changed];
  let count = 0;
  const base = {
    now: () => 1_000_000,
    readText: () => "지시문",
    checkEnvironment: () => [],
    ensureWorkspace: () => {},
    listChangedFiles: () => (changedQueue.length > 1 ? changedQueue.shift() : changedQueue[0]),
    runTurn: async (request) => {
      calls.runTurn.push(request);
      const reply = replies[Math.min(count, replies.length - 1)];
      count += 1;
      if (reply instanceof Error) throw reply;
      if (typeof reply === "function") return reply(request);
      return { status: 0, threadId: "thread-1", turnId: `turn-${count}`, finalMessage: reply, error: null };
    },
    interrupt: async (request) => {
      calls.interrupt.push(request);
    },
    readTurnSummary: async () => SUMMARY,
    snapshotRepo: () => ({}),
    sleep: async () => {},
    commitFiles: (cwd, files, message) => {
      calls.commit.push({ files, message });
      return "abc1234";
    },
    appendLine: (file, value) => calls.lines.push({ file, value }),
    writeJson: (file, value) => calls.json.push({ file, value }),
    settings: { protectedPaths: [".claude/", ".githooks/", "CLAUDE.md", ".codex/"] },
    prepareProjectConfig: async () => ({ hash: "h1", warnings: [], problems: [] }),
    projectConfigHash: () => "h1",
    checkAppsTools: async () => ({ problems: [], toolCount: 0 }),
    checkLimits: async () => ({ status: "ok", reason: "한도 충분" }),
    listRootDirs: () => [],
    isIgnored: () => false,
    cleanupCodexTmp: () => ({ removed: [], failed: [] }),
    readSubagents: () => [],
    ...deps
  };
  const opts = {
    action: "start",
    cwd: "/repo",
    promptFile: "/repo/.superpowers/sdd/p/prompt.md",
    workspace: "/repo/.superpowers/sdd/p",
    role: "implement",
    task: "1",
    round: null,
    threadId: null,
    effort: null,
    model: null,
    timeoutMin: 30,
    out: "/repo/.superpowers/sdd/p/codex-results/r.json",
    ...options
  };
  return { run: () => runWrapper(opts, base), calls };
}

const STOP_REPORT = "STATUS: NEEDS_CONTEXT\nCHANGED_FILES: none\nCOMMIT_MESSAGE: none\nTESTS: none\nCONCERNS: 명세에 경계값이 없습니다";

test("환경 점검에 문제가 있으면 Codex를 부르지 않고 5", async () => {
  const { run, calls } = setup({ deps: { checkEnvironment: () => ["버전 불일치"] } });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.ENVIRONMENT);
  assert.match(result.reason, /버전 불일치/);
  assert.equal(calls.runTurn.length, 0);
  assert.equal(calls.lines.length, 0);
  assert.equal(calls.json.length, 1);
});

test("check는 환경 점검만 하고 파일을 쓰지 않는다", async () => {
  const { run, calls } = setup({ options: { action: "check" } });
  const { exitCode, summaryLine } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(calls.runTurn.length, 0);
  assert.equal(calls.json.length, 0);
  assert.match(summaryLine, /^codex-run exit=0 /);
});

test("지시 파일을 읽을 수 없으면 3", async () => {
  const { run, calls } = setup({ deps: { readText: () => null } });
  assert.equal((await run()).exitCode, EXIT.FAILED);
  assert.equal(calls.runTurn.length, 0);
});

test("새 대화를 시작하기 전에 커밋되지 않은 변경이 있으면 3", async () => {
  const { run, calls } = setup({ changed: [["stray.txt"]] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /stray\.txt/);
  assert.equal(calls.runTurn.length, 0);
});

test("DONE이고 보고가 실제 변경과 같으면 보고된 파일만 커밋하고 0", async () => {
  const { run, calls } = setup();
  const { exitCode, result, summaryLine } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(calls.runTurn[0].resumeThreadId, null);
  assert.deepEqual(calls.commit[0].files, ["greet.py", "tests/test_greet.py"]);
  assert.equal(calls.commit[0].message, "feat: 작별 인사 추가\n\nCo-Authored-By: Codex gpt-test <noreply@openai.com>\n");
  assert.equal(result.commit, "abc1234");
  assert.equal(result.threadId, "thread-1");
  assert.equal(calls.lines.length, 1);
  assert.ok(calls.lines[0].file.endsWith("codex-calls.jsonl"));
  assert.equal(calls.lines[0].value.tokens.total_tokens, 12);
  assert.equal(calls.lines[0].value.weeklyStart, 12);
  assert.equal(calls.lines[0].value.weeklyEnd, 13);
  assert.equal(calls.json[0].file, "/repo/.superpowers/sdd/p/codex-results/r.json");
  assert.match(summaryLine, /exit=0 status=DONE thread=thread-1 commit=abc1234 corrections=0 warnings=0 tokens=12 weekly=12%->13%/);
});

test("네트워크 명령은 막지 않고 경고로 남긴다", async () => {
  const { run, calls } = setup({
    deps: {
      readTurnSummary: async () => ({ ...SUMMARY, commands: ["const r = await tools.exec_command({cmd: \"pip install requests\"})"] })
    }
  });
  const { exitCode, result, summaryLine } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(calls.commit.length, 1);
  assert.equal(result.networkCommands.length, 1);
  assert.equal(result.networkCommands[0].turnId, "turn-1");
  assert.match(result.warnings[0], /네트워크 명령 감지/);
  assert.equal(calls.lines[0].value.networkCommands, 1);
  assert.equal(calls.lines[0].value.lateChanges, null);
  assert.match(summaryLine, /warnings=1/);
});

test("STATUS 줄이 없으면 같은 대화에 한 번 정정을 요청한다", async () => {
  const { run, calls } = setup({ replies: ["다 했습니다.", DONE()] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(result.corrections, 1);
  assert.equal(calls.runTurn[1].resumeThreadId, "thread-1");
  assert.match(calls.runTurn[1].prompt, /could not be parsed/);
});

test("형식 위반 정정과 불일치 정정을 종류별로 센다", async () => {
  const { run, calls } = setup({ replies: ["다 했습니다.", DONE("greet.py"), DONE()] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(result.corrections, 2);
  assert.equal(result.formatCorrections, 1);
  assert.equal(result.mismatchCorrections, 1);
  assert.equal(calls.lines[0].value.formatCorrections, 1);
  assert.equal(calls.lines[0].value.mismatchCorrections, 1);
});

test("정정 뒤에도 형식 위반이면 커밋하지 않고 3", async () => {
  const { run, calls } = setup({ replies: ["다 했습니다.", "정말 다 했습니다."] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /형식 위반/);
  assert.equal(calls.commit.length, 0);
});

test("보고와 실제 변경이 다르면 한 번 정정을 요청하고, 맞으면 커밋한다", async () => {
  const { run, calls } = setup({ replies: [DONE("greet.py"), DONE()] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(result.corrections, 1);
  assert.match(calls.runTurn[1].prompt, /Changed but not reported: tests\/test_greet\.py/);
  assert.deepEqual(calls.commit[0].files, ["greet.py", "tests/test_greet.py"]);
});

test("정정 뒤에도 보고와 실제 변경이 다르면 커밋하지 않고 3", async () => {
  const { run, calls } = setup({ replies: [DONE("greet.py"), DONE("greet.py")] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /실제에만 있음: tests\/test_greet\.py/);
  assert.equal(calls.commit.length, 0);
});

test("NEEDS_CONTEXT면 커밋하지 않고 2", async () => {
  const { run, calls } = setup({ replies: [STOP_REPORT] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.STOPPED);
  assert.equal(result.report.concerns, "명세에 경계값이 없습니다");
  assert.equal(calls.commit.length, 0);
});

test("변경 없는 DONE은 커밋하지 않고 0", async () => {
  const { run, calls } = setup({ replies: [DONE("none", "none")], changed: [[], []] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(calls.commit.length, 0);
  assert.equal(result.commit, null);
});

test("호출 중 예외면 3, 한도 오류면 4", async () => {
  const failed = setup({ replies: [new Error("connection reset")] });
  const first = await failed.run();
  assert.equal(first.exitCode, EXIT.FAILED);
  assert.match(first.result.reason, /connection reset/);

  const limited = setup({ replies: [new Error("You've hit your usage limit.")] });
  assert.equal((await limited.run()).exitCode, EXIT.LIMIT);
});

test("차례가 실패하고 세션 기록이 한도 도달을 알리면 4", async () => {
  const { run } = setup({
    replies: [() => ({ status: 1, threadId: "thread-1", turnId: "turn-1", finalMessage: "", error: { message: "stream disconnected" } })],
    deps: { readTurnSummary: async () => ({ ...SUMMARY, limitReached: true }) }
  });
  assert.equal((await run()).exitCode, EXIT.LIMIT);
});

test("차례가 정상으로 끝났으면 한도 정보가 도달을 가리켜도 결과를 쓴다", async () => {
  const { run, calls } = setup({ deps: { readTurnSummary: async () => ({ ...SUMMARY, limitReached: true }) } });
  assert.equal((await run()).exitCode, EXIT.OK);
  assert.equal(calls.commit.length, 1);
});

test("재시도된 일시 오류가 있어도 정상 완료된 차례는 커밋하고 0", async () => {
  const { run, calls } = setup({
    replies: [
      () => ({
        status: 0,
        threadId: "thread-1",
        turnId: "turn-1",
        finalMessage: DONE(),
        error: { message: "Reconnecting... 1/5 (stream disconnected)" }
      })
    ]
  });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(calls.commit.length, 1);
  assert.match(result.transientError, /Reconnecting/);
});

const hangAfterStart = (request) => {
  request.onProgress({ message: "Turn started", threadId: "thread-1", turnId: "turn-9" });
  return new Promise(() => {});
};

test("제한 시간을 넘기면 Codex 실행을 중단시키고 3", async () => {
  const { run, calls } = setup({
    options: { timeoutMin: 0.001 },
    replies: [hangAfterStart],
    deps: {
      interrupt: async (request) => {
        calls.interrupt.push(request);
        return { attempted: true, interrupted: true, detail: "ok" };
      }
    }
  });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /제한 시간/);
  assert.match(result.reason, /중단 성공/);
  assert.equal(result.interrupt.interrupted, true);
  assert.deepEqual(calls.interrupt[0], { cwd: "/repo", threadId: "thread-1", turnId: "turn-9" });
});

test("시간 초과 뒤 2분 동안 바뀐 파일을 기록한다", async () => {
  const snapshots = [{}, { "late.txt": "1:1" }];
  const sleeps = [];
  const { run } = setup({
    options: { timeoutMin: 0.001 },
    replies: [hangAfterStart],
    deps: {
      interrupt: async () => ({ attempted: true, interrupted: true, detail: "ok" }),
      snapshotRepo: () => snapshots.shift(),
      sleep: async (ms) => {
        sleeps.push(ms);
      }
    }
  });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.deepEqual(sleeps, [120000]);
  assert.deepEqual(result.lateChanges, ["late.txt"]);
  assert.match(result.reason, /바뀐 파일 1개/);
  assert.ok(result.warnings.some((warning) => /late\.txt/.test(warning)));
});

test("시간 초과 뒤 변경 확인이 실패해도 제한 시간 결과를 남긴다", async () => {
  const { run } = setup({
    options: { timeoutMin: 0.001 },
    replies: [hangAfterStart],
    deps: {
      interrupt: async () => ({ attempted: true, interrupted: true, detail: "ok" }),
      snapshotRepo: () => {
        throw new Error("git status failed");
      }
    }
  });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /제한 시간/);
  assert.match(result.reason, /변경 확인 실패: git status failed/);
  assert.equal(result.lateChanges, null);
  assert.equal(result.interrupt.interrupted, true);
});

test("중단 요청이 예외를 던져도 제한 시간 결과와 대화 ID를 남긴다", async () => {
  const { run } = setup({
    options: { timeoutMin: 0.001 },
    replies: [hangAfterStart],
    deps: {
      interrupt: async () => {
        throw new Error("broker gone");
      }
    }
  });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /제한 시간/);
  assert.match(result.reason, /broker gone/);
  assert.equal(result.threadId, "thread-1");
  assert.equal(result.interrupt.interrupted, false);
});

test("중단 요청이 응답하지 않으면 시간 상한 뒤 실패로 기록한다", async () => {
  const { run } = setup({
    options: { timeoutMin: 0.001 },
    replies: [hangAfterStart],
    deps: { interrupt: () => new Promise(() => {}), interruptTimeoutMs: 20 }
  });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.equal(result.interrupt.detail, "중단 요청 시간 초과");
});

test("resume은 지정한 대화로 이어가고, 다른 대화가 돌아오면 3", async () => {
  const { run, calls } = setup({ options: { action: "resume", threadId: "thread-7" } });
  const { exitCode, result } = await run();
  assert.equal(calls.runTurn[0].resumeThreadId, "thread-7");
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /thread-7/);
});

test("세션 기록이 없어도 결과를 남기고 사용량은 비운다", async () => {
  const { run, calls } = setup({ deps: { readTurnSummary: async () => null } });
  const { exitCode } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(calls.lines[0].value.tokens, null);
  assert.match(calls.commit[0].message, /Co-Authored-By: Codex unknown-model/);
});

test("의존성 호출이 예외를 던져도 결과와 대화 ID를 남기고 3", async () => {
  const { run, calls } = setup({
    deps: {
      commitFiles: () => {
        throw new Error("git identity unknown");
      }
    }
  });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /예상하지 못한 오류: git identity unknown/);
  assert.equal(calls.json.length, 1);
  assert.equal(calls.json[0].value.threadId, "thread-1");
  assert.equal(calls.json[0].value.report.status, "DONE");
  assert.equal(calls.lines.length, 1);
});

test("결과 파일을 쓰지 못해도 요약 줄을 돌려준다", async () => {
  const { run } = setup({
    deps: {
      writeJson: () => {
        throw new Error("disk full");
      }
    }
  });
  const { exitCode, summaryLine } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.match(summaryLine, /결과 기록 실패: disk full/);
});

test("하위 에이전트 결과에 명령과 토큰이 없어도 결과와 사용량 기록을 남긴다", async () => {
  const { run, calls } = setup({ deps: { readSubagents: () => [{ threadId: "x" }] } });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(result.usage.subagentCount, 1);
  assert.ok(result.warnings.includes("하위 에이전트 1개: x"));
  assert.equal(calls.json.length, 1);
  assert.equal(calls.lines.length, 1);
});

test("임시 폴더 정리 결과가 빈 객체여도 결과와 사용량 기록을 남긴다", async () => {
  const { run, calls } = setup({ deps: { cleanupCodexTmp: () => ({}) } });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(calls.json.length, 1);
  assert.equal(calls.lines.length, 1);
  assert.ok(!result.warnings.some((warning) => /임시 항목/.test(warning)));
});

test("하위 에이전트 결과가 배열이 아니어도 결과와 사용량 기록을 남긴다", async () => {
  const { run, calls } = setup({ deps: { readSubagents: () => ({ threadId: "x" }) } });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(result.usage.subagentCount, 0);
  assert.equal(calls.json.length, 1);
  assert.equal(calls.lines.length, 1);
});

test("하위 에이전트 확인이 예외를 던져도 결과를 남기고 경고한다", async () => {
  const { run, calls } = setup({
    deps: {
      readSubagents: () => {
        throw new Error("rollout unreadable");
      }
    }
  });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.ok(result.warnings.includes("하위 에이전트 확인 실패: rollout unreadable"));
  assert.equal(calls.json.length, 1);
  assert.equal(calls.lines.length, 1);
});

test("첫 지시문 앞에만 공통 규칙을 붙인다", async () => {
  const { run, calls } = setup({ replies: ["형식이 없는 답", DONE()] });
  await run();
  assert.match(calls.runTurn[0].prompt, /^## Workflow rules \(always apply\)/);
  assert.match(calls.runTurn[0].prompt, /\.claude\/, \.githooks\/, CLAUDE\.md, \.codex\//);
  assert.ok(calls.runTurn[0].prompt.endsWith("\n\n지시문"));
  assert.doesNotMatch(calls.runTurn[1].prompt, /Workflow rules/);
});

test("호출 전 한도가 부족하면 Codex를 부르지 않고 4", async () => {
  const { run, calls } = setup({ deps: { checkLimits: async () => ({ status: "short", reason: "10080분 창 남은 3% < 기준 5% (풀리는 시각 2026-10-17 14:08:50)" }) } });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.LIMIT);
  assert.match(result.reason, /^한도 부족\(호출 전 확인\): 10080분 창 남은 3%/);
  assert.equal(calls.runTurn.length, 0);
});

test("한도를 확인하지 못하면 Codex를 부르지 않고 5", async () => {
  const { run, calls } = setup({ deps: { checkLimits: async () => ({ status: "error", reason: "설정 파일에 요금제 team의 기준값이 없습니다" }) } });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.ENVIRONMENT);
  assert.match(result.reason, /^한도 확인 실패: 설정 파일에 요금제 team/);
  assert.equal(calls.runTurn.length, 0);
});

test("프로젝트 Codex 설정에 문제가 있으면 5, 준비 중 경고는 결과에 남긴다", async () => {
  const bad = setup({ deps: { prepareProjectConfig: async () => ({ hash: "h1", warnings: [], problems: ["외부 연결 도구(features.apps)가 꺼져 있지 않습니다"] }) } });
  const failed = await bad.run();
  assert.equal(failed.exitCode, EXIT.ENVIRONMENT);
  assert.equal(bad.calls.runTurn.length, 0);
  const warned = setup({ deps: { prepareProjectConfig: async () => ({ hash: "h1", warnings: ["프로젝트 Codex 설정을 다시 썼습니다(이전 내용과 달랐음)"], problems: [] }) } });
  const ok = await warned.run();
  assert.equal(ok.exitCode, EXIT.OK);
  assert.ok(ok.result.warnings.includes("프로젝트 Codex 설정을 다시 썼습니다(이전 내용과 달랐음)"));
});

test("호출 뒤 프로젝트 Codex 설정이 바뀌었으면 커밋하지 않고 3", async () => {
  const { run, calls } = setup({ deps: { projectConfigHash: () => "changed" } });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.equal(result.reason, "보호 파일 변경: .codex/config.toml");
  assert.equal(calls.commit.length, 0);
});

test("보호 경로를 바꿨으면 보고했든 안 했든 커밋하지 않고 3", async () => {
  const reported = setup({ replies: [DONE("greet.py, CLAUDE.md")], changed: [[], ["CLAUDE.md", "greet.py"]] });
  const first = await reported.run();
  assert.equal(first.exitCode, EXIT.FAILED);
  assert.equal(first.result.reason, "보호 경로 변경: CLAUDE.md");
  assert.deepEqual(first.result.protectedChanges, ["CLAUDE.md"]);
  assert.equal(reported.calls.commit.length, 0);

  const unreported = setup({ replies: [DONE("greet.py"), DONE("greet.py, .claude/settings.json")], changed: [[], [".claude/settings.json", "greet.py"]] });
  const second = await unreported.run();
  assert.equal(second.exitCode, EXIT.FAILED);
  assert.equal(second.result.mismatchCorrections, 1);
  assert.match(second.result.reason, /^보호 경로 변경: \.claude\/settings\.json$/);
  assert.equal(unreported.calls.commit.length, 0);
});

test("이번 호출의 하위 에이전트 토큰과 명령을 합치고 경고를 남긴다", async () => {
  const seen = [];
  const child = { threadId: "child-1", tokens: { total_tokens: 30 }, commands: ["taskkill /PID 99 /F", "curl https://example.com"] };
  const { run, calls } = setup({
    deps: {
      readSubagents: (threadId, sinceMs) => {
        seen.push({ threadId, sinceMs });
        return [child];
      }
    }
  });
  const { exitCode, result, summaryLine } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.deepEqual(seen, [{ threadId: "thread-1", sinceMs: 1_000_000 }]);
  assert.equal(result.usage.subagentCount, 1);
  assert.equal(result.usage.subagentTokens.total_tokens, 30);
  assert.equal(result.usage.totalTokens.total_tokens, 42);
  assert.deepEqual(result.subagents, [{ threadId: "child-1", tokens: { total_tokens: 30 } }]);
  assert.ok(result.warnings.includes("하위 에이전트 1개: child-1"));
  assert.ok(result.warnings.some((warning) => /^위험 명령 감지 \(프로세스 종료\): taskkill/.test(warning)));
  assert.ok(result.warnings.some((warning) => /^네트워크 명령 감지/.test(warning)));
  assert.equal(calls.lines[0].value.subagentCount, 1);
  assert.equal(calls.lines[0].value.subagentTokens.total_tokens, 30);
  assert.equal(calls.lines[0].value.totalTokens.total_tokens, 42);
  assert.equal(calls.lines[0].value.riskyCommands, 1);
  assert.match(summaryLine, /tokens=42 weekly=12%->13% subagents=1 /);
});

test("호출 뒤 임시 폴더를 정리하고, Codex 호출이 실패해도 정리한다", async () => {
  const cleaned = [];
  const cleanup = () => {
    cleaned.push(true);
    return { removed: ["tmpabc"], failed: ["tmplocked: EPERM"] };
  };
  const ok = setup({ deps: { cleanupCodexTmp: cleanup } });
  const first = await ok.run();
  assert.deepEqual(first.result.tempCleanup, { removed: ["tmpabc"], failed: ["tmplocked: EPERM"] });
  assert.ok(first.result.warnings.includes("남은 임시 항목 1개 정리: tmpabc"));
  assert.ok(first.result.warnings.includes("임시 항목 정리 실패: tmplocked: EPERM"));
  const failing = setup({ replies: [new Error("network down")], deps: { cleanupCodexTmp: cleanup } });
  const second = await failing.run();
  assert.equal(second.exitCode, EXIT.FAILED);
  assert.equal(cleaned.length, 2);
});

test("저장소 최상위에 git에 보이지 않는 새 폴더가 생기면 경고한다", async () => {
  const roots = [["src"], ["src", "tmpxyz", "pkg"]];
  const { run } = setup({ replies: [DONE("pkg/a.py")], changed: [[], ["pkg/a.py"]], deps: { listRootDirs: () => roots.shift() } });
  const { result } = await run();
  assert.deepEqual(result.newRootDirs, ["tmpxyz"]);
  assert.ok(result.warnings.includes("저장소 최상위에 git에 보이지 않는 새 폴더: tmpxyz"));
});

test("같은 호출에서 커밋된 새 폴더는 커밋 뒤 변경 목록이 비어도 경고하지 않는다", async () => {
  let committed = false;
  const roots = [["src"], ["src", "pkg"]];
  let listCalls = 0;
  const { run, calls } = setup({
    replies: [DONE("pkg/a.py")],
    deps: {
      // 첫 호출은 시작 전 점검(깨끗함), 이후는 커밋 전까지 pkg/a.py, 커밋 뒤에는 빈 목록
      listChangedFiles: () => {
        listCalls += 1;
        return listCalls === 1 || committed ? [] : ["pkg/a.py"];
      },
      commitFiles: (cwd, files) => {
        committed = true;
        calls.commit.push({ files });
        return "abc1234";
      },
      listRootDirs: () => roots.shift()
    }
  });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.deepEqual(calls.commit[0].files, ["pkg/a.py"]);
  assert.deepEqual(result.newRootDirs, []);
  assert.ok(!result.warnings.some((w) => w.includes("새 폴더")));
});

test("check는 외부 연결 도구가 켜져 있으면 5, 꺼져 있으면 개수를 알린다", async () => {
  const on = setup({ options: { action: "check" }, deps: { checkAppsTools: async () => ({ problems: ["외부 연결 도구가 켜져 있습니다: codex_apps 도구 190개"], toolCount: 190 }) } });
  const failed = await on.run();
  assert.equal(failed.exitCode, EXIT.ENVIRONMENT);
  assert.match(failed.result.reason, /codex_apps 도구 190개/);
  const off = setup({ options: { action: "check" } });
  const passed = await off.run();
  assert.equal(passed.exitCode, EXIT.OK);
  assert.equal(passed.result.reason, "환경 점검 통과 (외부 연결 도구 0개)");
  assert.equal(off.calls.runTurn.length, 0);
});

test("check는 경고를 요약 줄 뒤에 한 줄씩 보여 준다", async () => {
  const { run } = setup({ options: { action: "check" }, deps: { prepareProjectConfig: async () => ({ hash: "h1", warnings: ["설정 경고 하나"], problems: [] }) } });
  const { summaryLine } = await run();
  const lines = summaryLine.split("\n");
  assert.match(lines[0], /^codex-run exit=0 /);
  assert.equal(lines[1], "warning: 설정 경고 하나");
});

test("NEEDS_CONTEXT인데 보호 경로가 바뀌었으면 2가 아니라 3", async () => {
  const { run, calls } = setup({ replies: [STOP_REPORT], changed: [[], ["CLAUDE.md"]] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.equal(result.reason, "보호 경로 변경: CLAUDE.md");
  assert.equal(calls.commit.length, 0);
});
