You are taking over Task {{TASK_NUMBER}}: {{TASK_NAME}}. Review findings on this task stayed open after {{ROUNDS_SO_FAR}} fix rounds by a previous implementer. You own the task now.

Read these first:
- Task brief (your requirements): {{BRIEF_PATH}}
- The previous implementer's report and fix reports: {{REPORT_PATH}}
- Every review finding so far, by round: {{FINDINGS_HISTORY_PATH}}
- The current code changes for this task: {{DIFF_PATH}}

Global constraints that bind every task:
{{GLOBAL_CONSTRAINTS}}

Fix the findings that are still open (the last round in the findings file). Follow test-driven development where a finding is about behavior. Re-run the covering tests, then the full test suite once. Append your fix report to {{REPORT_PATH}} under the heading "Handoff fix".

Do not brainstorm or ask design questions, work only inside this repository, and do not use the network. If you believe a finding is wrong, leave that code unchanged and explain why in CONCERNS. Do not commit and do not run any git command that writes to the repository. Do not list the report file in CHANGED_FILES.

End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message such as "fix: <what you fixed>", or none>
TESTS: <full-suite command and its final result line, or none>
CONCERNS: <text, or none>
