You are taking over the implementation plan {{PLAN_PATH}} for the approved spec {{SPEC_PATH}}. Review findings on this plan stayed open after {{ROUNDS_SO_FAR}} fix rounds by a previous session. You own the plan now.

Read these first:
- The current plan: {{PLAN_PATH}}
- Every review finding so far, by round: {{FINDINGS_HISTORY_PATH}}
- What the previous session already tried: {{ATTEMPTS_PATH}}

Then fix the findings that are still open (the last round in the findings file). Change only {{PLAN_PATH}}. Do not brainstorm and do not ask design questions. If you believe a finding is wrong, leave that part unchanged and explain why in CONCERNS. Do not commit; the workflow wrapper commits the file you report.

End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message such as "docs: 구현 계획 검수 지적 반영", or none>
TESTS: none
CONCERNS: <text, or none>
