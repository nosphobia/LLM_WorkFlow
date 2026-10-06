import test from "node:test";
import assert from "node:assert/strict";
import { shutdownBroker, isProcessAlive } from "../lib/broker.mjs";

const SESSION = { endpoint: "pipe:\\\\.\\pipe\\cxc-1", pidFile: "D:/x/broker.pid", logFile: "D:/x/broker.log", sessionDir: "D:/x", pid: 4242 };

function setup({ session = SESSION, aliveChecks = [false], deps = {} } = {}) {
  const log = [];
  const alive = [...aliveChecks];
  let clock = 0;
  const base = {
    loadBrokerSession: (cwd) => {
      log.push(["load", cwd]);
      return session;
    },
    sendBrokerShutdown: async (endpoint) => {
      log.push(["send", endpoint]);
    },
    teardownBrokerSession: (args) => log.push(["teardown", args]),
    clearBrokerSession: (cwd) => log.push(["clear", cwd]),
    isAlive: (pid) => {
      const value = alive.length > 1 ? alive.shift() : alive[0];
      log.push(["alive", pid, value]);
      return value;
    },
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    ...deps
  };
  return { run: () => shutdownBroker("D:/repo", base), log };
}

const kinds = (log) => log.map(([kind]) => kind);

test("브로커가 없으면 아무것도 하지 않는다", async () => {
  const { run, log } = setup({ session: null });
  const result = await run();
  assert.equal(result.stopped, false);
  assert.equal(result.pid, null);
  assert.match(result.detail, /브로커가 없습니다/);
  assert.deepEqual(log, [["load", "D:/repo"]]);
});

test("종료 요청 → 프로세스 종료 확인 → 기록 정리 순서로 진행한다", async () => {
  const { run, log } = setup({ aliveChecks: [true, true, false] });
  const result = await run();
  assert.deepEqual(kinds(log), ["load", "send", "alive", "alive", "alive", "teardown", "clear"]);
  assert.equal(log[1][1], SESSION.endpoint);
  assert.deepEqual(log[5][1], {
    endpoint: SESSION.endpoint,
    pidFile: SESSION.pidFile,
    logFile: SESSION.logFile,
    sessionDir: SESSION.sessionDir,
    pid: 4242
  });
  assert.deepEqual(log[6], ["clear", "D:/repo"]);
  assert.deepEqual(result, { stopped: true, exited: true, pid: 4242, detail: "종료 요청을 보냈습니다" });
});

test("프로세스가 시간 안에 끝나지 않으면 기록을 남기고 PID를 알린다", async () => {
  const { run, log } = setup({ aliveChecks: [true], deps: { exitWaitMs: 1_000 } });
  const result = await run();
  assert.equal(result.stopped, false);
  assert.equal(result.exited, false);
  assert.equal(result.pid, 4242);
  assert.match(result.detail, /기록을 남겼습니다 \(PID 4242\)/);
  assert.ok(!kinds(log).includes("teardown"));
  assert.ok(!kinds(log).includes("clear"));
});

test("종료 요청이 응답하지 않으면 시간 상한 뒤 종료 확인으로 넘어간다", async () => {
  const { run } = setup({
    deps: {
      sendTimeoutMs: 20,
      sendBrokerShutdown: () => new Promise(() => {})
    }
  });
  const result = await run();
  assert.match(result.detail, /응답 없음/);
  assert.equal(result.exited, true);
  assert.equal(result.stopped, true);
});

test("종료 요청이 실패해도 종료 확인과 기록 정리는 한다", async () => {
  const { run, log } = setup({
    deps: {
      sendBrokerShutdown: async () => {
        throw new Error("pipe closed");
      }
    }
  });
  const result = await run();
  assert.match(result.detail, /종료 요청 실패: pipe closed/);
  assert.ok(kinds(log).includes("teardown"));
});

test("기록에 pid가 없으면 종료를 확인할 수 없으므로 exited가 null이다", async () => {
  const { run, log } = setup({ session: { ...SESSION, pid: null } });
  const result = await run();
  assert.equal(result.exited, null);
  assert.ok(!kinds(log).includes("alive"));
});

test("프로세스 생존 확인: 없으면 false, 권한 오류는 살아 있는 것으로 본다", () => {
  assert.equal(isProcessAlive(1, () => true), true);
  assert.equal(isProcessAlive(1, () => {
    throw Object.assign(new Error("no such process"), { code: "ESRCH" });
  }), false);
  assert.equal(isProcessAlive(1, () => {
    throw Object.assign(new Error("denied"), { code: "EPERM" });
  }), true);
});
