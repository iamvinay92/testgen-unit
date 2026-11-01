# Contributing

Use Node.js 22+. No npm dependency installation is needed to run the toolkit tests. Run `npm test` and `npm run check`; run the affected real language example using `EXAMPLE_LANGUAGE=go|java|python npm run test:examples`.

Add regression tests for behavior changes, including failed subprocesses and unavailable coverage. Tests use temporary directories; never overwrite consumer projects. Review findings are heuristic and should explain false-positive possibilities.

Keep PRs focused. Include the problem, behavior change and commands actually run. Do not add credentials, private-service assumptions or automatic target dependency changes. New language support needs discovery, prompts, checks, coverage, review and public examples together.
