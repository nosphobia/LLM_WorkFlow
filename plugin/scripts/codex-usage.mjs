#!/usr/bin/env node
// 진행 기록 폴더의 codex-calls.jsonl 합계를 출력한다. 사용법: node codex-usage.mjs <진행 기록 폴더>
import fs from "node:fs";
import path from "node:path";
import { USAGE_FILE } from "./lib/pins.mjs";
import { summarizeCalls } from "./lib/usage.mjs";

const dir = process.argv[2];
if (!dir) {
  console.error("사용법: node codex-usage.mjs <진행 기록 폴더>");
  process.exit(3);
}
const file = path.join(dir, USAGE_FILE);
if (!fs.existsSync(file)) {
  console.error(`기록 파일이 없습니다: ${file}`);
  process.exit(3);
}
console.log(JSON.stringify(summarizeCalls(fs.readFileSync(file, "utf8")), null, 2));
