A reviewer checked your work on Task {{TASK_NUMBER}}: {{TASK_NAME}} and found the issues listed in {{FINDINGS_PATH}}.

Fix every issue. Do not change anything the findings do not require. If you believe a finding is wrong, leave that code unchanged and explain why in CONCERNS.
Re-run the tests that cover the amended code, then the full test suite once.
Append a fix report to {{REPORT_PATH}}: what you changed, the covering tests, the commands, and their output.

Same rules as before: do not brainstorm or ask design questions, work only inside this repository, and do not use the network. Do not commit and do not run any git command that writes to the repository; the workflow wrapper commits the files you report. Do not list the report file in CHANGED_FILES.

End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message such as "fix: <what you fixed>", or none>
TESTS: <full-suite command and its final result line, or none>
CONCERNS: <text, or none>
