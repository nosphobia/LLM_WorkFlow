You are writing an implementation plan in the git repository at the current working directory. The spec is approved. Do not brainstorm, do not write or change a spec, do not ask design questions, and do not start implementing.

## Inputs
- Approved spec: {{SPEC_PATH}}
- Write the plan to: {{PLAN_PATH}}

## How to write the plan
1. Use your superpowers:writing-plans skill and follow it, with these overrides:
   - The header line "For agentic workers" must read: REQUIRED SUB-SKILL: Use llm-workflow:codex-execution to implement this plan task-by-task. Do not name superpowers:subagent-driven-development or superpowers:executing-plans anywhere in the plan.
   - Skip the skill's "Execution Handoff" section. Do not ask which execution approach to use.
   - Keep each task's commit step and its commit message, but write it as "Report this commit message; the workflow wrapper commits." Implementers never run git commit.
2. Write the plan's prose in Korean. Keep code, commands, file paths, and identifiers as they are.
3. Run the skill's self-review on the finished plan and fix what it finds.
4. Change no file other than {{PLAN_PATH}}. Do not commit; the workflow wrapper commits the file you report.

If the spec leaves a decision you cannot make, stop and report NEEDS_CONTEXT with the question in CONCERNS.

## Final message
End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message such as "docs: <topic> 구현 계획 추가", or none>
TESTS: none
CONCERNS: <text, or none>
