import test from "node:test";
import assert from "node:assert/strict";
import { parseReport, buildFormatCorrection, buildMismatchCorrection, REPORT_FIELDS } from "../lib/report.mjs";

const report = (lines) => lines.join("\n");

test("정상 DONE 보고를 해석한다", () => {
  const parsed = parseReport(report([
    "작업을 마쳤습니다.",
    "STATUS: DONE",
    "CHANGED_FILES: greet.py, tests/test_greet.py",
    "COMMIT_MESSAGE: feat: 작별 인사 추가",
    "TESTS: python -m unittest — OK",
    "CONCERNS: none"
  ]));
  assert.deepEqual(parsed, {
    ok: true,
    status: "DONE",
    changedFiles: ["greet.py", "tests/test_greet.py"],
    commitMessage: "feat: 작별 인사 추가",
    tests: "python -m unittest — OK",
    concerns: null
  });
});

test("마크다운으로 꾸민 보고 줄도 해석한다", () => {
  const parsed = parseReport(report([
    "**STATUS:** `DONE_WITH_CONCERNS`",
    "- CHANGED_FILES: greet.py",
    "**COMMIT_MESSAGE**: feat: 시험",
    "TESTS: none",
    "CONCERNS: 경계값 테스트가 부족합니다"
  ]));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, "DONE_WITH_CONCERNS");
  assert.deepEqual(parsed.changedFiles, ["greet.py"]);
  assert.equal(parsed.commitMessage, "feat: 시험");
  assert.equal(parsed.concerns, "경계값 테스트가 부족합니다");
});

test("Windows 경로, ./ 접두어, 백틱, 중복을 정리한다", () => {
  const parsed = parseReport(report([
    "STATUS: DONE",
    "CHANGED_FILES: `tests\\test_greet.py`, ./greet.py, greet.py",
    "COMMIT_MESSAGE: feat: 시험",
    "TESTS: none",
    "CONCERNS: none"
  ]));
  assert.deepEqual(parsed.changedFiles, ["tests/test_greet.py", "greet.py"]);
});

test("none은 빈 목록과 null로 바꾼다", () => {
  const parsed = parseReport(report([
    "STATUS: DONE",
    "CHANGED_FILES: none",
    "COMMIT_MESSAGE: none",
    "TESTS: none",
    "CONCERNS: None"
  ]));
  assert.deepEqual(parsed.changedFiles, []);
  assert.equal(parsed.commitMessage, null);
  assert.equal(parsed.concerns, null);
});

test("같은 줄이 두 번 나오면 마지막 값을 쓴다", () => {
  const parsed = parseReport(report([
    "STATUS: BLOCKED",
    "STATUS: DONE",
    "CHANGED_FILES: none",
    "COMMIT_MESSAGE: none",
    "TESTS: none",
    "CONCERNS: none"
  ]));
  assert.equal(parsed.status, "DONE");
});

test("NEEDS_CONTEXT 보고의 CONCERNS를 남긴다", () => {
  const parsed = parseReport(report([
    "STATUS: NEEDS_CONTEXT",
    "CHANGED_FILES: none",
    "COMMIT_MESSAGE: none",
    "TESTS: none",
    "CONCERNS: 명세에 경계값이 없습니다"
  ]));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, "NEEDS_CONTEXT");
  assert.equal(parsed.concerns, "명세에 경계값이 없습니다");
});

test("STATUS 줄이 없으면 형식 위반이다", () => {
  const parsed = parseReport("다 했습니다.\nCHANGED_FILES: none\nCOMMIT_MESSAGE: none\nTESTS: none\nCONCERNS: none");
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /STATUS/);
});

test("알 수 없는 STATUS 값은 형식 위반이다", () => {
  const parsed = parseReport("STATUS: FINISHED\nCHANGED_FILES: none\nCOMMIT_MESSAGE: none\nTESTS: none\nCONCERNS: none");
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /FINISHED/);
});

test("빈 메시지는 형식 위반이다", () => {
  assert.equal(parseReport("").ok, false);
  assert.equal(parseReport(null).ok, false);
});

test("변경 파일이 있는데 COMMIT_MESSAGE가 none이면 형식 위반이다", () => {
  const parsed = parseReport("STATUS: DONE\nCHANGED_FILES: greet.py\nCOMMIT_MESSAGE: none\nTESTS: none\nCONCERNS: none");
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /COMMIT_MESSAGE/);
});

test("정정 요청 문구에 문제와 다섯 보고 줄이 들어간다", () => {
  const text = buildFormatCorrection("보고 줄이 없습니다: STATUS");
  assert.match(text, /보고 줄이 없습니다: STATUS/);
  for (const field of REPORT_FIELDS) assert.match(text, new RegExp(`^${field}: `, "m"));
});

test("불일치 정정 요청 문구에 양쪽 목록이 들어간다", () => {
  const text = buildMismatchCorrection({ missing: ["a.py"], extra: ["tests/b.py"] });
  assert.match(text, /Reported but not changed: a\.py/);
  assert.match(text, /Changed but not reported: tests\/b\.py/);
  assert.match(text, /^STATUS: /m);
});
