// 한 Codex 대화가 만든 하위 에이전트 대화 기록을 찾아 토큰과 명령을 읽는다. 하위의 하위도 따라간다.
// 래퍼 기록에는 메인 대화만 남으므로, 이것이 없으면 하위 에이전트 토큰이 빠진다(3단계 시험에서 약 19.5%).
import fs from "node:fs";
import path from "node:path";
import { COMMAND_TYPES, commandText } from "./rollout.mjs";

export function parseChildRollout(text) {
  const child = { threadId: null, parentThreadId: null, tokens: null, commands: [] };
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      continue;
    }
    const payload = event.payload ?? {};
    if (event.type === "session_meta") {
      child.threadId = payload.id ?? child.threadId;
      child.parentThreadId = payload.source?.subagent?.thread_spawn?.parent_thread_id ?? child.parentThreadId;
    } else if (COMMAND_TYPES.has(payload.type)) {
      child.commands.push(commandText(payload));
    } else if (event.type === "event_msg" && payload.type === "token_count" && payload.info?.total_token_usage) {
      child.tokens = payload.info.total_token_usage;
    }
  }
  return child;
}

export function findSubagents(sessionsDir, parentThreadId, sinceMs, fsx = fs) {
  if (!parentThreadId || !fsx.existsSync(sessionsDir)) return [];
  const candidates = [];
  for (const name of fsx.readdirSync(sessionsDir, { recursive: true })) {
    const file = path.join(sessionsDir, String(name));
    if (!file.endsWith(".jsonl")) continue;
    try {
      const stat = fsx.statSync(file);
      // 이번 호출 전에 끝난 기록은 앞 호출의 하위 에이전트다. 같은 대화를 이어갈 때 두 번 세지 않는다.
      if (stat.mtimeMs < sinceMs) continue;
      candidates.push(parseChildRollout(fsx.readFileSync(file, "utf8")));
    } catch {
      continue;
    }
  }
  const parents = new Set([parentThreadId]);
  const found = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const child of candidates) {
      if (child.threadId && child.parentThreadId && parents.has(child.parentThreadId) && !parents.has(child.threadId)) {
        parents.add(child.threadId);
        found.push(child);
        grew = true;
      }
    }
  }
  return found;
}
