import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PLUGIN_ROOT } from "../lib/pins.mjs";

const template = path.resolve(PLUGIN_ROOT, "..", "project-template");
const read = (name) => fs.readFileSync(path.join(template, name), "utf8");

test("템플릿은 래퍼가 관리하는 .codex/를 git에서 뺀다", () => {
  assert.match(read(".gitignore"), /^\.codex\/$/m);
});

test("템플릿 규칙은 메시지, 명세, 이어서 진행, 권한 규칙을 담는다", () => {
  const claude = read("CLAUDE.md");
  for (const phrase of [
    "[명세 3/6]",
    "[개발 중 · 큰 문제]",
    "선택지와 추천안 한 줄",
    "docs/reports/",
    ".superpowers/sdd/<계획>/reports/",
    "짧은 체크 목록",
    "출력 인코딩, 줄 나누기, 반올림, 표기 예시",
    "계획 검토: 요청",
    "측정: 예",
    "이어서 진행",
    "권한 문제로 막히면 우회하지 않는다",
    "사람 확인",
    "`.codex/`는 llm-workflow 래퍼가 관리하는"
  ]) {
    assert.ok(claude.includes(phrase), phrase);
  }
  assert.doesNotMatch(claude, /권한 문제로 막히면 우회하지 말고 멈춘 뒤 사용자에게 알린다/);
});
