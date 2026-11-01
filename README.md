# testgen-unit

A small CLI and coding-agent skill for **Go, Java and Python unit tests**. Inspect an existing project, establish a baseline, emit a scoped prompt, validate tests, measure coverage, and review changes.

Use an existing AI coding agent or a local model through Ollama. The agent writes tests; the CLI runs checks and reports their evidence. Prompt and check commands require no model API key, private service, Bash, or jq. Optional direct generation supports Ollama and compatible APIs.

**Start here:** [Local model and agent setup](docs/local-models.md). In your target repository, run `testgen-unit install-skill` and use your existing agent, or `ollama launch opencode` with a local model.

## Install from this checkout

Requires Node.js 22 or newer and the target project's toolchain. This package has no npm runtime dependencies.

```sh
npm install -g .
testgen-unit --version
testgen-unit --help
```

For an installation without administrator access:

```sh
npm install -g --prefix "$HOME/.local" .
export PATH="$HOME/.local/bin:$PATH"
```

You can also run `node /path/to/testgen-unit/bin/testgen-unit.js` without installing anything. This repository is prepared for publication; an npm registry release is not yet available through this project.

## First run

From a trusted target repository:

```sh
testgen-unit doctor --language python
testgen-unit unit-status --language python --check --json
testgen-unit unit-coverage --language python --json
testgen-unit unit-init --language python --check-only
testgen-unit unit-init --language python --skip-claude-commands
testgen-unit generate-unit-tests --language python --dry-run -- "Cover validation and error paths"
```

Give the emitted prompt to your coding agent, or run `testgen-unit install-skill` to install [the skill](skills/testgen-unit-tests/SKILL.md). After writing a small batch:

```sh
testgen-unit validate-unit-tests --language python
testgen-unit unit-coverage --language python --fail-under 80 --json
testgen-unit review-unit-tests --language python --fail-on-issues --json
```

Use `--language go` or `--language java` for the other runtimes. A coverage target is optional; 80 above is an example. Repeat meaningful batches until your requested target is met or concrete blockers remain. The CLI itself never generates tests or claims that a prompt has been executed.

## Runtime support

| Language | Discovery and checks | Coverage |
| --- | --- | --- |
| Go | `go.mod`; `go list`, `go test`; Go and gofmt on PATH | Statement counts from a fresh `go test -coverprofile` run |
| Java | Maven/Gradle descriptors; existing wrapper preferred, otherwise installed Maven/Gradle; required JDK | Fresh JaCoCo XML from existing build configuration; line counts |
| Python | `pyproject.toml`, `setup.py`, `setup.cfg`, `pytest.ini`, or a simple directory containing Python files; pytest or unittest | coverage.py in the selected Python environment; statement counts |

Go must satisfy the target's `go.mod`. Java must satisfy its build. Python support targets Python 3.10+. The CLI does not install or upgrade target dependencies.

For Python, use the existing environment or create one explicitly:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install pytest coverage
testgen-unit doctor --language python --python .venv/bin/python
```

Use `--python /absolute/path/to/python` when working across directories. By default the CLI uses the project's `.venv`, the active virtualenv, then `python3` (`python` on Windows). `--runner unittest` uses standard-library discovery; coverage still requires coverage.py. For unittest, `unit-status --check` runs tests because unittest has no collection-only command; `--compile-only` is unsupported. Exclusions inside unittest's discovery directory are rejected: narrow `pythonTestDir` or use pytest. Empty unittest discovery is a failure. Pytest status checks collection. Go/Java status checks compile tests. Linux and macOS are the tested platforms; Windows build wrappers are not supported in v0.1.

## Scope and configuration

`-d DIR` selects the target repository. `--module path` selects one exact project; `--module .` selects all projects of the chosen language. Mixed-language repositories require `--language`. Nested projects are discovered separately. `--exclude path` excludes a subtree from discovery; Go/Python also exclude those paths from package/test/coverage selection. Java test selection is owned by its build; discovery exclusions do not rewrite an aggregate Maven/Gradle build.

`--package ./internal/foo` selects Go packages. `--file path` supplies generation context or selects static review files; validation and coverage remain at project/package scope. Python test selection follows the existing runner configuration. Custom Python runners (tox, nox, Poetry commands), Maven aggregate coverage, and nonstandard JaCoCo report paths are not supported in v0.1.

Optional `.testgen/config.json`:

```json
{
  "unitExcludes": ["integration"],
  "pythonRunner": "pytest",
  "pythonSources": ["src"],
  "pythonTestDir": "tests"
}
```

Python source/test paths are relative to each selected project. Set `pythonSources` to the production directories you intend to measure; default is `.`. Coverage excludes conventional Python test files and selected nested/excluded projects. Existing coverage.py settings (for example branch collection) still apply, but the reported percentage always uses covered/total statements. Java coverage requires XML at `target/site/jacoco/jacoco.xml` or `build/reports/jacoco/test/jacocoTestReport.xml`. Missing coverage is **unavailable**, never 0 or a pass.

Totals are weighted by statement/line counts across fully measured projects **within one language**. If any selected project fails or has unavailable coverage, that language's overall percentage is unavailable. Go/Python statements and Java lines are different metrics; do not compare or average them as one number.

## Safety and evidence

- `unit-init` adds only missing guidance and preserves existing `AGENTS.md`, prompts, and Claude commands. Use `--check-only` to preview.
- Generation emits up to 60,000 characters of source/test context to stdout. Only explicit `--provider` generation transmits context to the chosen model endpoint. The response is unvalidated suggestions and never automatically applied.
- Validation, coverage, doctor (build-wrapper version checks), and `unit-status --check` can execute project code. Run them only on trusted repositories. Subprocesses have a configurable per-command timeout (`--timeout`, milliseconds).
- Review checks for common sleep, assertion, duplicate-test and Git scope problems. These are heuristics, not proof of test quality or absence of network access. Python review parses AST without importing target code.
- Review compares Git changes against `HEAD` or `--base REF`, including untracked files. Inspect baseline and onboarding findings. `--skip-coverage` avoids test execution; `--fail-on-issues` makes findings fail the command.
- Validation's `--forbid-source-changes` rejects changes outside conventional test paths. Run it in an initialized Git repository with a baseline commit. Onboarding guidance can be reported as non-test changes: record it separately rather than suppressing findings.
- Normalized JSON contains command argument arrays, captured output, project statuses, and coverage counts. Exit 0 means the requested checks completed; failed or unavailable checks exit nonzero. Review findings exit nonzero only with `--fail-on-issues`.
- Git branch creation, committing, pushing, and opening PRs belong to the user or agent. The CLI never publishes repository changes.

## Develop

```sh
npm test
npm run check
EXAMPLE_LANGUAGE=go npm run test:examples
EXAMPLE_LANGUAGE=python npm run test:examples
EXAMPLE_LANGUAGE=java npm run test:examples
npm pack --dry-run
```

Example checks run actual toolchains; Java downloads public test/build dependencies. See [CONTRIBUTING.md](CONTRIBUTING.md), [release checklist](docs/releasing.md), and the [technical article draft](docs/blog-draft.md). MIT license; see [LICENSE](LICENSE). Publication and package-name availability remain release gates.
