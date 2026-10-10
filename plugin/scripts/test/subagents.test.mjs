import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseChildRollout, findSubagents } from "../lib/subagents.mjs";

const line = (value) => JSON.stringify(value);
const meta = (id, parent) =>
  line({ type: "session_meta", payload: { id, source: parent ? { subagent: { thread_spawn: { parent_thread_id: parent } } } : "vscode" } });
const tokens = (total) => line({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { total_tokens: total } } } });
const call = (cmd) => line({ type: "response_item", payload: { type: "custom_tool_call", input: cmd } });

test("하위 에이전트 기록에서 ID, 부모, 마지막 토큰, 명령을 읽는다", () => {
  const child = parseChildRollout([meta("c1", "p1"), call("git status"), tokens(10), "깨진 줄", call("python -m unittest"), tokens(25)].join("\n"));
  assert.deepEqual(child, { threadId: "c1", parentThreadId: "p1", tokens: { total_tokens: 25 }, commands: ["git status", "python -m unittest"] });
  assert.equal(parseChildRollout(meta("m1", null)).parentThreadId, null);
});

test("이번 호출에서 생긴 하위와 그 하위만 찾는다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-test-"));
  const day = path.join(dir, "2026", "10", "10");
  fs.mkdirSync(day, { recursive: true });
  const write = (name, text, mtimeMs) => {
    const file = path.join(day, name);
    fs.writeFileSync(file, text);
    if (mtimeMs) fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
  };
  const since = Date.now() - 60_000;
  write("rollout-a-p1.jsonl", meta("p1", null));
  write("rollout-b-c1.jsonl", [meta("c1", "p1"), tokens(5)].join("\n"));
  write("rollout-c-g1.jsonl", [meta("g1", "c1"), tokens(7)].join("\n"));
  write("rollout-d-x1.jsonl", [meta("x1", "other"), tokens(9)].join("\n"));
  write("rollout-e-old.jsonl", [meta("old", "p1"), tokens(3)].join("\n"), since - 3_600_000);
  write("notes.txt", "not a rollout");
  const found = findSubagents(dir, "p1", since);
  assert.deepEqual(found.map((child) => child.threadId).sort(), ["c1", "g1"]);
  assert.deepEqual(findSubagents(dir, null, since), []);
  assert.deepEqual(findSubagents(path.join(dir, "missing"), "p1", since), []);

  const locked = { ...fs, readFileSync: (file, ...rest) => { if (String(file).includes("rollout-c-")) throw Object.assign(new Error("busy"), { code: "EBUSY" }); return fs.readFileSync(file, ...rest); } };
  assert.deepEqual(findSubagents(dir, "p1", since, locked).map((child) => child.threadId), ["c1"]);
});
