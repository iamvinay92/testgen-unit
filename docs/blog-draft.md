# Beyond test generation: a measurable workflow for AI-written unit tests

*Draft. Add public repository/package links and measured example results after the release checks. Do not publish unverified performance or quality claims.*

Generating test code is only one part of improving a test suite. An agent also needs to find the right project, preserve existing work, establish a baseline, and show that its changes run. A coverage increase is useful evidence, but a test that mirrors production logic can raise coverage without protecting behavior.

`testgen-unit` separates the agent's judgment from repeatable tooling. The agent reads source and writes tests. The CLI discovers Go, Java or Python projects, emits scoped instructions, runs the project's tools, and reports their output. Users can install the skill into an existing coding agent, use a local model through Ollama, or request suggestions from a compatible API. A local model needs no paid API, although hardware and compute still have costs.

The workflow is intentionally small: inspect → baseline → prompt → write a focused batch → validate → measure → review. Repeat when the user requested a coverage target and meaningful gaps remain. Keep production code and build dependencies outside consumer test generation scope.

For Go, the CLI measures statement counts from fresh coverage profiles. Java uses existing JaCoCo XML and reports line coverage. Python runs pytest or unittest under coverage.py and reports statement coverage. These metrics have different meanings, so the toolkit never combines languages into one percentage. Missing reports, failed test runs and unmeasured modules cannot silently disappear from an overall result.

A public demonstration should show an initial production function and partial tests, the baseline command output, an agent-written behavioral test, and the final command output. Include the diff so readers can assess assertions instead of judging the workflow by its percentage alone. The repository's examples make this demonstration repeatable; they are not a benchmark of agent quality.

Operational failures shaped the design too. A CLI that is unavailable on PATH cannot validate anything. A fresh container may lack a language runtime. A stale report is not evidence for the current changes. The public implementation uses Node's standard library, a prerequisite doctor, captured command results and temporary coverage artifacts to make those failures visible. Java reports must be freshly produced by the requested build.

Static review catches some familiar mistakes, such as sleeps, missing recognizable assertions and Python test definitions that shadow one another. It cannot determine every regression risk. The human or coding agent still needs to read the production behavior and explain why a test matters.

Before publication, add: a link to the public example commit; exact runtime versions; baseline/final command output; a representative test diff; and any remaining limitations. Avoid claiming a percentage improvement from a run that could not execute its required checks.
