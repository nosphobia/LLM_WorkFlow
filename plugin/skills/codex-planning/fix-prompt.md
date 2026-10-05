A reviewer compared your plan {{PLAN_PATH}} with the approved spec {{SPEC_PATH}} and found the issues listed in {{FINDINGS_PATH}}.

Fix every issue in {{PLAN_PATH}}. Do not change any other file, do not brainstorm, and do not ask design questions. If you believe an issue is wrong, leave that part unchanged and explain why in CONCERNS. Do not commit; the workflow wrapper commits the file you report.

End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message such as "docs: 구현 계획 검수 지적 반영", or none>
TESTS: none
CONCERNS: <text, or none>
