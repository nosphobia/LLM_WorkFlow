You are implementing Task {{TASK_NUMBER}}: {{TASK_NAME}} in the git repository at the current working directory.

## Task
Read your task brief first: {{BRIEF_PATH}}
It is your requirements, with the exact values to use verbatim. The approved spec is {{SPEC_PATH}} and the plan is {{PLAN_PATH}}; read them only for context the brief refers to.

## Context from the controller
{{CONTEXT}}

## Rules
- The design and the plan are approved. Do not brainstorm, do not write a new spec or plan, and do not ask design questions.
- Implement exactly what the brief specifies. Follow test-driven development: write the failing test, run it and see it fail, implement, run it and see it pass.
- While iterating, run the focused tests. Run the full test suite once before you report.
- Do not commit and do not run any git command that writes to the repository. The workflow wrapper commits the files you report. If the brief has a commit step, do not run it; use its commit message as COMMIT_MESSAGE.
- Work only inside this repository. Do not use the network.
- If something is unclear or you are stuck, stop and report NEEDS_CONTEXT or BLOCKED with the specifics in CONCERNS. Do not guess.
- If a file grows beyond the plan's intent, or the work needs restructuring the plan did not anticipate, finish what you can and report DONE_WITH_CONCERNS.

## Self-review before reporting
Check completeness (every requirement in the brief), quality (clear names, clean code), discipline (only what was asked, existing patterns followed), and testing (tests verify real behavior, test-driven development followed, clean output). Fix what you find.

## Report file
Write your full report to {{REPORT_PATH}}:
- What you implemented (or attempted, if blocked)
- Tests you ran and their results
- TDD evidence: RED (command, failing output, why it was expected) and GREEN (command, passing output)
- Files changed
- Self-review findings
- Concerns

The report file is in an ignored folder; do not list it in CHANGED_FILES.

## Final message
End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message, or none>
TESTS: <full-suite command and its final result line, or none>
CONCERNS: <text, or none>
