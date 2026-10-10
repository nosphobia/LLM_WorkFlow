#!/usr/bin/env node
// 3단계 비교 시험(2026-10-07~08)의 Codex 명령 기록을 위험 명령 탐지 테스트 자료로 뽑는다. 한 번만 돌린다.
// 사용: node make-trial-commands.mjs [Codex 세션 폴더]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMMAND_TYPES, commandText } from "../../lib/rollout.mjs";

const MAIN_THREADS = [
  "01a114fe-89d2-7510-abb7-21f255e99096",
  "01a11a2e-7763-7ee0-a9b0-5d4db9069ed9",
  "01a11a33-9eea-72b2-81ba-3187891883d5",
  "01a11a37-aef8-7a61-9ae8-3121458ab8b0",
  "01a11a3d-0c02-72c0-b53e-4a13267b1b65",
  "01a11a42-c5c6-76f3-bda5-ef7eb3481c41",
  "01a11bad-79b2-7d82-868c-a64f404c9549"
];
const sessions = process.argv[2] ?? path.join(os.homedir(), ".codex", "sessions");
const files = ["2026/10/07", "2026/10/08"].flatMap((day) =>
  fs.readdirSync(path.join(sessions, day)).map((name) => path.join(sessions, day, name))
);
const parentOf = (text) => /"parent_thread_id":"([0-9a-f-]+)"/.exec(text.slice(0, 8000))?.[1] ?? null;
const picked = files
  .filter((file) => {
    if (MAIN_THREADS.some((id) => path.basename(file).endsWith(`-${id}.jsonl`))) return true;
    return MAIN_THREADS.includes(parentOf(fs.readFileSync(file, "utf8")));
  })
  .sort();
const commands = [];
for (const file of picked) {
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      continue;
    }
    if (COMMAND_TYPES.has(event.payload?.type)) commands.push(commandText(event.payload));
  }
}
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "trial-commands.json");
fs.writeFileSync(out, `${JSON.stringify({ source: "3단계 비교 시험 Codex 기록 (메인 7개 + 하위 에이전트)", files: picked.length, commands }, null, 1)}\n`);
console.log(`wrote ${out}: ${picked.length} files, ${commands.length} commands`);
