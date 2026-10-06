// 저장소마다 하나씩 뜨는 Codex 브로커를 공식 플러그인의 종료 요청으로 닫는다. 프로세스를 이름으로 끝내지 않는다.
const DEFAULT_EXIT_WAIT_MS = 5_000;

export async function shutdownBroker(cwd, deps) {
  const session = deps.loadBrokerSession(cwd);
  if (!session) return { stopped: false, exited: null, pid: null, detail: "이 저장소의 브로커가 없습니다" };

  let detail = "종료 요청을 보냈습니다";
  try {
    await deps.sendBrokerShutdown(session.endpoint);
  } catch (error) {
    detail = `종료 요청 실패: ${error?.message ?? error}`;
  }
  const pid = session.pid ?? null;
  const exited = pid ? await waitForExit(pid, deps) : null;

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

async function waitForExit(pid, deps) {
  const deadline = deps.now() + (deps.exitWaitMs ?? DEFAULT_EXIT_WAIT_MS);
  while (deps.isAlive(pid)) {
    if (deps.now() >= deadline) return false;
    await deps.sleep(200);
  }
  return true;
}
