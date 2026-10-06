// 저장소마다 하나씩 뜨는 Codex 브로커를 공식 플러그인의 종료 요청으로 닫는다. 프로세스를 이름으로 끝내지 않는다.
const DEFAULT_EXIT_WAIT_MS = 5_000;
const DEFAULT_SEND_TIMEOUT_MS = 10_000;

export async function shutdownBroker(cwd, deps) {
  const session = deps.loadBrokerSession(cwd);
  if (!session) return { stopped: false, exited: null, pid: null, detail: "이 저장소의 브로커가 없습니다" };

  const detail = await sendWithLimit(session.endpoint, deps);
  const pid = session.pid ?? null;
  const exited = pid ? await waitForExit(pid, deps) : null;
  if (exited === false) {
    // 아직 살아 있는데 기록을 지우면 Codex 플러그인도 사람도 이 브로커를 찾을 수 없다.
    return { stopped: false, exited, pid, detail: `${detail}; 프로세스가 끝나지 않아 기록을 남겼습니다 (PID ${pid})` };
  }

  deps.teardownBrokerSession({
    endpoint: session.endpoint ?? null,
    pidFile: session.pidFile ?? null,
    logFile: session.logFile ?? null,
    sessionDir: session.sessionDir ?? null,
    pid
  });
  deps.clearBrokerSession(cwd);
  return { stopped: true, exited, pid, detail };
}

export function isProcessAlive(pid, kill = process.kill) {
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function sendWithLimit(endpoint, deps) {
  let timer;
  try {
    const pending = Promise.resolve().then(() => deps.sendBrokerShutdown(endpoint));
    pending.catch(() => {});
    const outcome = await Promise.race([
      pending.then(() => "sent"),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve("timeout"), deps.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS);
      })
    ]);
    return outcome === "sent" ? "종료 요청을 보냈습니다" : "종료 요청 응답 없음(시간 초과)";
  } catch (error) {
    return `종료 요청 실패: ${error?.message ?? error}`;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForExit(pid, deps) {
  const deadline = deps.now() + (deps.exitWaitMs ?? DEFAULT_EXIT_WAIT_MS);
  while (deps.isAlive(pid)) {
    if (deps.now() >= deadline) return false;
    await deps.sleep(200);
  }
  return true;
}
