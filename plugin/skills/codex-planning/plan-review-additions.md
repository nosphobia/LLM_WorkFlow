## Additional checks for this workflow

Report each of these explicitly, in addition to the categories above:

1. Spec coverage: list every requirement and success criterion in the spec and the task that implements it. A requirement with no task is an issue.
2. Exclusions: nothing the spec lists as out of scope may be implemented by any task. A task that does is an issue.
3. Task size: each task should be one reviewable unit with its own test cycle. Flag tasks too large to review in one pass or too small to carry their own tests.
4. Execution header: the plan header must name llm-workflow:codex-execution. Naming superpowers:subagent-driven-development or superpowers:executing-plans is an issue.
5. Commit steps: no step may tell the implementer to run git commit. Commit steps give the message to report.

You are read-only. Do not edit the plan or any other file.
