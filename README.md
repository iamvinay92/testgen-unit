# testgen-unit

**Write better unit tests with your coding agent—or a local model.**

`testgen-unit` helps you improve **Go, Java and Python** test suites through a repeatable workflow:

**Measure → generate → validate → measure again → review.**

The agent writes tests. The CLI runs your project's tools and reports what actually happened. Use your existing AI agent, local Ollama models, or a compatible API.

[![Checks](https://github.com/iamvinay92/testgen-unit/actions/workflows/ci.yml/badge.svg)](https://github.com/iamvinay92/testgen-unit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Why use it?

- **Works with existing repositories.** Discover projects, reuse tests and fixtures, and preserve customized guidance.
- **Supports local models.** Use Ollama without a paid model API, or keep your current agent/provider setup.
- **Checks the results.** Run validation, coverage and review through one CLI.
- **Keeps scope explicit.** Select a language, project or Go package. Generate tests without changing production code or dependencies.
- **Small installation.** No npm runtime dependencies, private services, Bash or jq required by the CLI.

## 1. Install

Install [Node.js 22+](https://nodejs.org/en/download), npm and Git, then run:

```sh
npm install -g testgen-unit
testgen-unit --version
```

If global installation needs administrator permission, use a writable directory:

```sh
npm install -g --prefix "$HOME/.local" \
  testgen-unit
export PATH="$HOME/.local/bin:$PATH"
```

The CLI is called **`testgen-unit`**. The package is available on [npm](https://www.npmjs.com/package/testgen-unit). A pinned tarball is also available from [GitHub Releases](https://github.com/iamvinay92/testgen-unit/releases/tag/v0.1.0).

## 2. Check your project

You also need your project's language tools and existing test dependencies:

| Language | Requirements | Coverage |
| --- | --- | --- |
| Go | Go version required by `go.mod`, plus `gofmt` | Go statement coverage |
| Java | Required JDK and Maven/Gradle; existing wrappers are preferred | Existing JaCoCo configuration with XML output |
| Python | Python 3.10+, pytest or unittest, and coverage.py | Python statement coverage |

From your repository:

```sh
cd /path/to/your/repository
testgen-unit doctor --language python
```

Replace `python` with `go` or `java`. The CLI reports missing tools; it does not install or upgrade project dependencies.

For a new Python test environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install pytest coverage
testgen-unit doctor --language python --python .venv/bin/python
```

## 3. Install the skill and ask your agent

```sh
testgen-unit install-skill
```

This adds the skill to your repository's `.agents/skills/`, `.claude/skills/` and `.opencode/skills/` directories. Existing skill files are preserved. Install just one with `--agent agents`, `--agent claude` or `--agent opencode`.

Reload your agent if needed, then ask:

> Use the testgen-unit-tests skill. Measure current unit-test coverage in this repository and increase it to 80%. Add deterministic tests for real production behavior. Only edit test files. Validate, measure and review after each batch. Report before/after coverage and blockers.

Change or omit the example coverage target. Ask for a branch or PR when you want one. If your agent does not discover skills, ask it to read the installed `SKILL.md` directly.

### Prefer a local model?

Install [Ollama](https://docs.ollama.com/quickstart), start its server and download a model your machine can run. From your repository:

```sh
ollama list
testgen-unit install-skill --agent opencode
ollama launch opencode
```

Choose a **local** model, then use the same request above. Ollama's launcher offers to install OpenCode when needed. Local inference needs no paid model API, but still requires hardware, storage and compute. Check the model's license and requirements.

See the [local model guide](docs/local-models.md) for prerequisites, existing-agent setup and API-backed usage.

## Use the CLI directly

You can also drive each step yourself:

```sh
testgen-unit unit-status --language python --check
testgen-unit unit-coverage --language python --json
testgen-unit unit-init --language python --check-only
testgen-unit unit-init --language python --skip-claude-commands
testgen-unit generate-unit-tests --language python --dry-run -- "Cover validation errors"
```

Give the emitted prompt to your agent. After writing a focused batch:

```sh
testgen-unit validate-unit-tests --language python
testgen-unit unit-coverage --language python --fail-under 80 --json
testgen-unit review-unit-tests --language python --fail-on-issues
```

`unit-init` adds missing guidance and preserves existing files. No default coverage target is imposed.

### Request suggestions from Ollama

Use the exact model name shown by `ollama list`:

```sh
testgen-unit generate-unit-tests --language python --file price.py \
  --provider ollama --model YOUR_INSTALLED_MODEL --timeout 600000 \
  -- "Cover validation and error paths"
```

**Direct generation prints suggestions.** It does not apply files, execute tests or autonomously repeat the loop. Review and apply the output, then run validation, coverage and review. Use a coding agent for orchestration.

Plain prompt generation and checks require no model key. Only explicit `--provider` generation sends scoped source context to the chosen endpoint. Compatible local servers and API providers are supported; see [examples and key configuration](docs/local-models.md).

## Select a scope

| Option | Purpose |
| --- | --- |
| `-d DIR` | Target repository |
| `--language go\|java\|python` | Select a runtime; required for mixed-language repositories |
| `--module PATH` | Select one discovered project; `.` selects all projects of that language |
| `--package ./internal/foo` | Select Go packages |
| `--file PATH` | Select prompt context or static review files; not validation/coverage scope |
| `--exclude PATH` | Exclude project subtrees |
| `--python /path/to/python` | Select a Python environment |
| `--runner unittest` | Use unittest instead of the default pytest |

Optional `.testgen/config.json`:

```json
{
  "unitExcludes": ["integration"],
  "pythonRunner": "pytest",
  "pythonSources": ["src"],
  "pythonTestDir": "tests"
}
```

Python paths are relative to each selected project. `pythonSources` defaults to `.`. Set it to the production directories you intend to measure. Java exclusions affect discovery; an aggregate Maven/Gradle build still owns its own test selection.

Run `testgen-unit --help` for all options.

## What has been tested?

- Regression tests cover discovery, scope boundaries, preserved guidance, failure handling, coverage totals, Git guards and model transports.
- Real Go, Maven, Gradle, pytest and unittest examples are included in [examples/](examples/).
- A real local **Qwen 2.5 Coder 14B** run raised coverage by at least 10 percentage points in three small demo repositories. The [full report](docs/validation/ollama-qwen2.5-coder-14b.md) includes the deliberately partial baselines and required corrections.

These demos verify integration; they are not benchmarks of production-repository effectiveness. The model needed corrections, including preserving an existing test and removing an invented assertion.

## Limits to understand

- Coverage is evidence, not proof of regression protection. Review assertions against production behavior.
- Go/Python report statements; Java reports lines. Totals are weighted within a language and never averaged across languages. Missing or failed coverage makes the overall selected-language total unavailable.
- Review is heuristic. It checks recognizable assertions, sleeps, duplicate tests, identical Python test bodies and Git scope changes. It cannot certify semantic correctness or isolation.
- Validation and coverage execute project code. Use trusted repositories. `review-unit-tests --skip-coverage` performs static review and Git inspection; Python source is parsed without importing it.
- Git review needs a baseline commit. It includes untracked files and compares against `HEAD` or `--base REF`. Record onboarding and existing changes separately.
- Java coverage needs fresh XML at `target/site/jacoco/jacoco.xml` or `build/reports/jacoco/test/jacocoTestReport.xml`. Aggregate/custom report locations are outside v0.1 support.
- Unittest status checks run tests; collection-only mode is unsupported. Exclusions inside its discovery directory require narrower `pythonTestDir` or pytest. Empty unittest suites fail.
- Custom Python runner commands and Windows build wrappers are outside v0.1 support. Linux and macOS are the CI platforms.

## Contribute

From a checkout, run `npm test` and `npm run check`. Use `EXAMPLE_LANGUAGE=go|java|python npm run test:examples` for real toolchain examples, replacing the language placeholder. `npm run test:ollama` is an opt-in local-model check; see [setup](docs/local-models.md).

Read [contributor guidance](CONTRIBUTING.md), [security reporting](SECURITY.md) and the [release checklist](docs/releasing.md). Licensed under [MIT](LICENSE).
