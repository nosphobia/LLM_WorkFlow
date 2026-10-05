The final review of this whole branch found the issues listed in {{FINDINGS_PATH}}. Fix all of them in this one pass.

Context: the approved spec {{SPEC_PATH}}, the plan {{PLAN_PATH}}, and the branch's changes {{DIFF_PATH}}.
Global constraints that bind every task:
{{GLOBAL_CONSTRAINTS}}

For each finding about behavior, add or update a test that fails before your fix and passes after it. Run the full test suite once at the end.
Write your report to {{REPORT_PATH}}: each finding, what you changed, the tests, the commands, and their output. If you believe a finding is wrong, leave that code unchanged and explain why in CONCERNS.

Do not brainstorm or ask design questions, work only inside this repository, and do not use the network. Do not commit and do not run any git command that writes to the repository. Do not list the report file in CHANGED_FILES.

End your final message with exactly these five lines:
STATUS: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>
CHANGED_FILES: <every file changed since the last commit, comma-separated repository-relative paths, or none>
COMMIT_MESSAGE: <one-line commit message such as "fix: 최종 검수 지적 반영", or none>
TESTS: <full-suite command and its final result line, or none>
CONCERNS: <text, or none>
