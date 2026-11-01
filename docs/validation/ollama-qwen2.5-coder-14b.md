# Local Ollama integration check — 2026-11-02

Tested `testgen-unit` with **qwen2.5-coder:14b-32k** (Ollama list ID `8e18b4082852`, approximately 9 GB) on macOS ARM64. Requests went to the local Ollama server; no paid model API was used.

These are three small standalone **demo repositories** copied from this toolkit's examples, with deliberately partial initial test suites. They exercise generation and verification, and are not a benchmark of production-repository coverage or general model quality. The Go and Java examples each contain only three measured statements/lines; Python contains four.

| Demo | Metric | Baseline | Accepted result | Increase | Final checks |
| --- | --- | --- | --- | --- | --- |
| Go | Statements | 2/3, 66.67% | 3/3, 100% | +33.33 points | Validation, coverage threshold and review passed |
| Java / Maven | Lines | 2/3, 66.67% | 3/3, 100% | +33.33 points | Validation, coverage threshold and review passed |
| Python / pytest | Statements | 3/4, 75% | 4/4, 100% | +25 points | Validation, coverage threshold and review passed |

The requested increase was **10 percentage points**. Each accepted batch modified one existing test file, retained the original error-path test, and left production source/build files unchanged. Generated tests exercised real discount calculation results, 0%/100% boundaries and invalid input errors.

## Method

1. Create isolated Git repositories and seed an error-path-only baseline. Ignore compiler/test artifacts before the baseline commit.
2. Run the selected CLI prerequisite doctor, `unit-status --check` and `unit-coverage --json`.
3. Install the bundled skill, preview/apply onboarding, and record guidance separately from test generation.
4. Call `generate-unit-tests --provider ollama --model qwen2.5-coder:14b-32k` with source/test context and a +10 point goal. Capture the response; apply only the returned test file inside the demo.
5. Run `validate-unit-tests --forbid-source-changes`, `unit-coverage --fail-under <baseline+10>` and `review-unit-tests --fail-on-issues`. Inspect the generated assertions and final Git diff.

Direct provider mode supplies suggestions. The test harness applied them and ran commands; the model did not autonomously invoke tools. An existing coding agent would perform that orchestration in normal skill use.

## Corrections and failures retained

- The first Go response omitted the original test. It was rejected. A preservation-specific follow-up produced the accepted batch.
- The initial Java/Python fixture setup accidentally committed generated build/cache artifacts. The source-change guard correctly reported them. Clean copies with ignore rules fixed the fixture bookkeeping; Java's first model response was replayed unchanged and passed.
- Python's first response repeated a zero-discount test. This exposed a review gap: the toolkit now checks for identical Python test bodies with matching parameters/decorators, including bodies that differ only in docstrings. The check is heuristic and does not establish semantic equivalence.
- A Python repair invented a requirement that fractional percentages raise `ValueError`. Native test execution through CLI validation rejected that assertion; annotations in the source do not enforce it. A final focused request specifying five useful tests produced a passing batch. This was not a one-shot or unattended success.

Runtime versions: Node.js 26.3.0, Go 1.25.6, JDK 25.0.2, Maven 3.9.12, Python 3.14.6, pytest 9.2.0 and coverage.py 7.17.0. Java's demo targets release 17. No latency or throughput benchmark was recorded.

## Repeat

From the toolkit checkout, with Ollama and all three toolchains available:

```sh
OLLAMA_MODEL=qwen2.5-coder:14b-32k \
EXAMPLE_PYTHON=/absolute/path/to/python \
npm run test:ollama
```

This opt-in runner saves raw model responses, command evidence, test diffs and summaries in a printed temporary directory. It allows bounded corrections and includes the focused Python fallback used above. Model output can vary; a failing smoke run is reported as a failure. Use `SMOKE_LANGUAGE=go|java|python` to select one language. No user repository is edited and no remote branch is pushed.

Full raw local logs remain outside the public repository because command output contains machine-specific paths. Keep those logs alongside any follow-up investigation; do not replace them with a model's self-reported success.
