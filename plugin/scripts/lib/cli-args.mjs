// codex-run.mjs의 명령줄 인자를 해석한다.
import path from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_TIMEOUT_MIN, EFFORTS, ROLES } from "./pins.mjs";

const ACTIONS = ["check", "start", "resume", "shutdown"];

export function parseCliArgs(argv, now = Date.now()) {
  const [action, ...rest] = argv;
  if (!ACTIONS.includes(action)) return fail("첫 인자는 check, start, resume, shutdown 중 하나여야 합니다");

  let values;
  try {
    ({ values } = parseArgs({
      args: rest,
      strict: true,
      options: {
        cwd: { type: "string" },
        "prompt-file": { type: "string" },
        workspace: { type: "string" },
        role: { type: "string" },
        task: { type: "string" },
        round: { type: "string" },
        thread: { type: "string" },
        effort: { type: "string" },
        model: { type: "string" },
        "timeout-min": { type: "string" },
        out: { type: "string" }
      }
    }));
  } catch (error) {
    return fail(error.message);
  }

  if (!values.cwd) return fail("--cwd가 필요합니다");
  const options = {
    action,
    cwd: path.resolve(values.cwd),
    effort: values.effort ?? null,
    model: values.model ?? null,
    timeoutMin: DEFAULT_TIMEOUT_MIN
  };
  if (options.effort !== null && !EFFORTS.includes(options.effort)) return fail(`--effort 값이 올바르지 않습니다: ${options.effort}`);
  if (values["timeout-min"] !== undefined) {
    const minutes = Number(values["timeout-min"]);
    if (!(minutes > 0)) return fail("--timeout-min은 0보다 큰 수여야 합니다");
    options.timeoutMin = minutes;
  }
  if (action === "check" || action === "shutdown") return { ok: true, options };

  for (const key of ["prompt-file", "workspace", "role"]) {
    if (!values[key]) return fail(`--${key}가 필요합니다`);
  }
  if (!ROLES.includes(values.role)) return fail(`--role 값이 올바르지 않습니다: ${values.role}`);
  if (action === "resume" && !values.thread) return fail("resume에는 --thread가 필요합니다");

  const workspace = path.resolve(values.workspace);
  const sddRoot = path.join(options.cwd, ".superpowers", "sdd");
  if (!isInside(workspace, sddRoot)) return fail(`--workspace는 ${sddRoot} 아래 폴더여야 합니다`);

  const round = values.round === undefined ? null : Number(values.round);
  if (round !== null && !(Number.isInteger(round) && round >= 0)) return fail("--round는 0 이상의 정수여야 합니다");

  Object.assign(options, {
    promptFile: path.resolve(values["prompt-file"]),
    workspace,
    role: values.role,
    task: values.task ?? null,
    round,
    threadId: values.thread ?? null
  });
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const name = `${stamp}-${values.role}${values.task ? `-t${values.task}` : ""}.json`;
  options.out = values.out ? path.resolve(values.out) : path.join(workspace, "codex-results", name);
  return { ok: true, options };
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function fail(error) {
  return { ok: false, error };
}
