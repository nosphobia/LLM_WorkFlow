import test from "node:test";
import assert from "node:assert/strict";
import { shutdownBroker } from "../lib/broker.mjs";

const SESSION = { endpoint: "pipe:\\\\.\\pipe\\cxc-1", pidFile: "D:/x/broker.pid", logFile: "D:/x/broker.log", sessionDir: "D:/x", pid: 4242 };

function setup({ session = SESSION, aliveChecks = [false], deps = {} } = {}) {
  const calls = { send: [], teardown: [], clear: [], sleep: 0 };
  const alive = [...aliveChecks];
  let clock = 0;
  const base = {
    loadBrokerSession: () => session,
    sendBrokerShutdown: async (endpoint) => {
      calls.send.push(endpoint);
    },
    teardownBrokerSession: (args) => calls.teardown.push(args),
    clearBrokerSession: (cwd) => calls.clear.push(cwd),
    isAlive: () => (alive.length > 1 ? alive.shift() : alive[0]),
    sleep: async (ms) => {
      calls.sleep += 1;
      clock += ms;
    },
    now: () => clock,
    ...deps
  };
  return { run: () => shutdownBroker("D:/repo", base), calls };
}

test("브로커가 없으면 아무것도 하지 않는다", async () => {
  const { run, calls } = setup({ session: null });
  const result = await run();
  assert.equal(result.stopped, false);
  assert.match(result.detail, /브로커가 없습니다/);
  assert.equal(calls.send.length, 0);
  assert.equal(calls.teardown.length, 0);
});

test("종료 요청을 보내고 프로세스가 끝날 때까지 기다린 뒤 기록을 정리한다", async () => {
  const { run, calls } = setup({ aliveChecks: [true, true, false] });
  const result = await run();
  assert.deepEqual(calls.send, [SESSION.endpoint]);
  assert.equal(result.stopped, true);
  assert.equal(result.exited, true);
  assert.equal(result.pid, 4242);
  assert.equal(calls.sleep, 2);
  assert.equal(calls.teardown.length, 1);
  assert.equal(calls.teardown[0].killProcess, undefined);
  assert.equal(calls.teardown[0].pid, 4242);
  assert.deepEqual(calls.clear, ["D:/repo"]);
});

test("프로세스가 시간 안에 끝나지 않으면 exited가 false다", async () => {
  const { run, calls } = setup({ aliveChecks: [true], deps: { exitWaitMs: 1_000 } });
  const result = await run();
  assert.equal(result.stopped, true);
  assert.equal(result.exited, false);
  assert.equal(calls.teardown.length, 1);
  assert.deepEqual(calls.clear, ["D:/repo"]);
});

test("종료 요청이 실패해도 기록은 정리하고 이유를 남긴다", async () => {
  const { run, calls } = setup({
    deps: {
      sendBrokerShutdown: async () => {
        throw new Error("pipe closed");
      }
    }
  });
  const result = await run();
  assert.match(result.detail, /종료 요청 실패: pipe closed/);
  assert.equal(calls.teardown.length, 1);
  assert.deepEqual(calls.clear, ["D:/repo"]);
});

test("기록에 pid가 없으면 기다리지 않는다", async () => {
  const { run, calls } = setup({ session: { ...SESSION, pid: null } });
  const result = await run();
  assert.equal(result.exited, null);
  assert.equal(calls.sleep, 0);
});
