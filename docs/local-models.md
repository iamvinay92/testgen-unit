# Write unit tests locally

Use a local coding agent to read your repository, edit tests and run the coverage loop. Local inference needs no paid model API, but it still requires sufficient RAM/VRAM, storage and compute. Check the model's license and hardware requirements; download its weights before going offline.

## Prerequisites

| Tool | Purpose |
| --- | --- |
| Node.js 22+ and npm | Installing and running this CLI |
| Git | Baseline comparison and change review |
| Go and gofmt; or required JDK plus Maven/Gradle; or Python 3.10+ | Your project's language toolchain |
| Existing project dependencies | Running your tests |
| pytest and coverage.py | Python's default runner and coverage; unittest can replace pytest |
| Ollama and a downloaded model | Optional local generation |
| A coding agent such as OpenCode | Applying tests and executing the agent loop |

Install Node.js from [official downloads](https://nodejs.org/en/download). Install Git and the required language toolchain using official instructions or your OS package manager. Match the project version; do not upgrade build files to satisfy the tool. `testgen-unit doctor --language python` checks the selected environment. Replace `python` with `go` or `java` for other projects.

## Recommended: local model plus coding agent

1. Install [Ollama](https://docs.ollama.com/quickstart), start its app/server and download a local model your machine can run. Use `ollama list` to find its exact name. Hosted model identifiers are not necessarily Ollama tags.
2. Install the toolkit from npm:

   ```sh
   npm install -g testgen-unit
   ```

3. In your target repository:

   ```sh
   testgen-unit install-skill --agent opencode
   testgen-unit doctor --language python
   ollama launch opencode
   ```

   Replace `python` with your language. Ollama's launcher offers to install OpenCode when needed. Select a **local** model when prompted.
4. Ask your agent:

   > Use the testgen-unit-tests skill. Measure current unit coverage, then increase it to 80% with deterministic tests of production behavior. Only edit test files. Validate, measure and review with testgen-unit after each batch. Report before/after coverage and blockers.

   Change or omit the example target. Ask for a branch or PR explicitly when needed. A coding agent with tool use executes this loop; a plain chat response cannot edit files or run commands.

## Use your existing AI agent

Run `testgen-unit install-skill` in the target repository. It installs missing skill files into `.agents/skills/`, `.claude/skills/` and `.opencode/skills/`. Select one with `--agent agents|claude|opencode`. Existing files are preserved. Reload your agent if it caches skills, or ask it to read the installed SKILL.md directly.

Use your agent's existing local model or API configuration. Prompt, validation, coverage and review commands require no model API key. Provider authentication stays with the agent.

## Direct suggestions through Ollama

```sh
ollama list
testgen-unit generate-unit-tests --language python --file price.py --dry-run
testgen-unit generate-unit-tests --language python --file price.py \
  --provider ollama --model YOUR_INSTALLED_MODEL --timeout 600000 \
  -- "Cover validation and error paths"
```

Use the exact installed model name. The default server is `http://127.0.0.1:11434`. Dry runs never contact a model. Explicit provider calls send scoped source context to the chosen endpoint and print unvalidated suggestions. Review/apply them, then run validation, coverage and review. Direct mode does not edit files or autonomously repeat the loop.

Already running a compatible local server such as LM Studio or vLLM? Use its Chat Completions endpoint:

```sh
testgen-unit generate-unit-tests --language go --provider openai-compatible \
  --base-url http://127.0.0.1:8000/v1 --model YOUR_SERVED_MODEL \
  -- "Cover invalid-input behavior"
```

## API-backed suggestions

Load your key into `TESTGEN_API_KEY` using existing secret management, or name another environment variable with `--api-key-env`. Never put a real key in command arguments, repository files or prompts.

```sh
testgen-unit generate-unit-tests --language java --provider openai-compatible \
  --base-url https://YOUR_PROVIDER/v1 --model YOUR_DEPLOYMENT \
  -- "Cover validation failures using existing JUnit conventions"
```

Only explicit `--provider` generation transmits context. API charges and source handling follow the selected provider's policy. For APIs that differ from Chat Completions, use your agent's provider integration.

## Model experience

The maintainer reports experiments with `Qwen/Qwen3.8-27B-FP8` and `DeepSeek-V4-Flash`. These are reported identifiers, not bundled downloads, verified Ollama tags or a published benchmark. Record model revision, serving runtime, hardware, context limit and measured test results before making reproducible claims. Unit transport tests use protocol fixtures. A separate [real local Qwen 2.5 Coder smoke test](validation/ollama-qwen2.5-coder-14b.md) documents measured demo results and the corrections it required.

Start with one file or small package. Full repository work benefits from sufficient context and tool use support. Model output can be wrong; validation and review remain necessary.

## Run the real-model smoke test

From a toolkit checkout, with the three language toolchains and Python test dependencies available:

```sh
OLLAMA_MODEL=qwen2.5-coder:14b-32k \
EXAMPLE_PYTHON=/absolute/path/to/python \
npm run test:ollama
```

This opt-in command uses your local Ollama server, makes three temporary standalone demo repositories, seeds deliberately partial baselines, asks the model for at least +10 percentage points, and runs validation, coverage and review. It saves responses, diffs and results in the printed evidence directory. It can apply generated code and execute tests inside those demos; review the runner before use. Your original repositories are not edited. It is never run by `npm test` or CI automatically. Use `SMOKE_LANGUAGE=go`, `java` or `python` to select one language.

References: [Ollama quickstart](https://docs.ollama.com/quickstart), [generation API](https://docs.ollama.com/api/generate), [compatible API](https://docs.ollama.com/api/openai-compatibility), [OpenCode providers](https://opencode.ai/docs/providers/), [pytest invocation](https://docs.pytest.org/en/stable/how-to/usage.html), [coverage.py](https://coverage.readthedocs.io/en/latest/commands/cmd_run.html).
