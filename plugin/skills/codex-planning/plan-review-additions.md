## Additional checks for this workflow

Report each of these explicitly, in addition to the categories above:

1. Spec coverage: list every requirement and success criterion in the spec and the task that implements it. A requirement with no task is an issue.
2. Exclusions: nothing the spec lists as out of scope may be implemented by any task. A task that does is an issue.
3. Task size: each task should be one reviewable unit with its own test cycle. Flag tasks too large to review in one pass or too small to carry their own tests.
4. Execution header: the plan header must name llm-workflow:codex-execution. Naming superpowers:subagent-driven-development or superpowers:executing-plans is an issue.
5. Commit steps: no step may tell the implementer to run git commit. Commit steps give the message to report.
6. Spec line: the plan header must contain the line **Spec:** `<spec path>` with the English label and the path of the approved spec. A missing line, a translated label, or a wrong path is an Important issue, because the workflow stops when it cannot read this line.

Review statically. Do not assemble, copy out, or run the plan's code: the implementers run their tests and the master runs the full suite later. Run code only if this dispatch explicitly names a disputed finding to check, and then only for that finding.

You are read-only. Do not edit the plan or any other file.
