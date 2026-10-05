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
    commitFiles: (cwd, files, message) => {
      calls.commit.push({ files, message });
      return "abc1234";
    },
    appendLine: (file, value) => calls.lines.push({ file, value }),
    writeJson: (file, value) => calls.json.push({ file, value }),
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
  assert.match(summaryLine, /exit=0 status=DONE thread=thread-1 commit=abc1234 corrections=0 tokens=12 weekly=12%->13%/);
});

test("STATUS 줄이 없으면 같은 대화에 한 번 정정을 요청한다", async () => {
  const { run, calls } = setup({ replies: ["다 했습니다.", DONE()] });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.OK);
  assert.equal(result.corrections, 1);
  assert.equal(calls.runTurn[1].resumeThreadId, "thread-1");
  assert.match(calls.runTurn[1].prompt, /could not be parsed/);
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

test("제한 시간을 넘기면 Codex 실행을 중단시키고 3", async () => {
  const { run, calls } = setup({
    options: { timeoutMin: 0.001 },
    replies: [
      (request) => {
        request.onProgress({ message: "Turn started", threadId: "thread-1", turnId: "turn-9" });
        return new Promise(() => {});
      }
    ]
  });
  const { exitCode, result } = await run();
  assert.equal(exitCode, EXIT.FAILED);
  assert.match(result.reason, /제한 시간/);
  assert.deepEqual(calls.interrupt[0], { cwd: "/repo", threadId: "thread-1", turnId: "turn-9" });
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
