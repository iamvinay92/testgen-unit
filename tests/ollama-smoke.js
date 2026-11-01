// Opt-in real model integration test. Never run by npm test or CI automatically.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir, platform, arch } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const toolkit = resolve(process.env.TESTGEN_TOOLKIT_DIR ?? fileURLToPath(new URL('../', import.meta.url)));
const cli = join(toolkit, 'bin/testgen-unit.js');
const model = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:14b-32k';
const python = process.env.EXAMPLE_PYTHON;
const languageFilter = process.env.SMOKE_LANGUAGE;
const directory = mkdtempSync(join(tmpdir(), 'testgen-unit-ollama-'));
const reports = join(directory, 'reports');
mkdirSync(reports);
const report = { model, modelServer: 'http://127.0.0.1:11434', node: process.version, platform: `${platform()}-${arch()}`, startedAt: new Date().toISOString(), description: 'Three standalone demo repositories with intentionally partial baseline suites. This is an integration smoke test, not a production-repository benchmark.', directory, projects: [] };
const env = { ...process.env };
delete env.TESTGEN_API_KEY;
delete env.TESTGEN_LOCAL_SMOKE_UNUSED;
function save() { writeFileSync(join(directory, 'summary.json'), JSON.stringify(report, null, 2) + '\n'); }
function shell(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 660000, maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}
function git(cwd, ...args) { return shell('git', args, cwd); }
function write(root, file, text) { mkdirSync(resolve(root, file, '..'), { recursive: true }); writeFileSync(join(root, file), text); }
function hash(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function commit(cwd, message) {
  git(cwd, 'add', '.');
  git(cwd, '-c', 'user.name=Smoke Test', '-c', 'user.email=smoke@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', `${message}\n\nCo-authored-by: Codex <noreply@openai.com>`);
}
function call(project, command, args, label) {
  const argv = [cli, command, '-d', project.directory, '--language', project.language, '--json'];
  if (project.language === 'python' && python) argv.push('--python', resolve(python));
  argv.push(...args);
  const child = spawnSync(process.execPath, argv, { env, encoding: 'utf8', timeout: 660000, maxBuffer: 32 * 1024 * 1024 });
  let data;
  try { data = JSON.parse(child.stdout); }
  catch { data = { status: 'fail', error: child.error?.message ?? child.stderr ?? 'No JSON output' }; }
  const result = { command: [basename(process.execPath), ...argv], exitCode: child.status, data };
  writeFileSync(join(reports, `${project.language}-${label}.json`), JSON.stringify(result, null, 2) + '\n');
  return result;
}
function requirePass(result, label) { if (result.exitCode !== 0 || result.data.status !== 'pass') throw new Error(`${label} failed; inspect ${reports}`); return result.data; }
const definitions = [
  { language: 'go', example: 'go', source: 'price.go', test: 'price_test.go', fence: 'go', baselineName: 'TestRejectsNegativeTotal', baseline: `package price

import "testing"

func TestRejectsNegativeTotal(t *testing.T) {
    _, err := Discount(-1, 20)
    if err == nil {
        t.Fatal("expected invalid-total error")
    }
}
` },
  { language: 'java', example: 'java-maven', source: 'src/main/java/example/Price.java', test: 'src/test/java/example/PriceTest.java', fence: 'java', baselineName: 'rejectsNegativeTotal', baseline: `package example;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PriceTest {
    @Test
    void rejectsNegativeTotal() {
        assertThrows(IllegalArgumentException.class, () -> Price.discount(-1, 20));
    }
}
` },
  { language: 'python', example: 'python', source: 'price.py', test: 'tests/test_price.py', fence: 'python', baselineName: 'test_rejects_negative_total', baseline: `import pytest
from price import discount


def test_rejects_negative_total():
    with pytest.raises(ValueError):
        discount(-1, 20)
` },
];
console.log(`Evidence directory: ${directory}`);
save();
for (const definition of definitions.filter(p => !languageFilter || p.language === languageFilter)) {
  const project = { language: definition.language, directory: join(directory, definition.language), status: 'running' };
  report.projects.push(project); save();
  try {
    console.log(`[${project.language}] Preparing the deliberately partial baseline`);
    cpSync(join(toolkit, 'examples', definition.example), project.directory, { recursive: true, filter: source => !['target', 'build', '.gradle', '__pycache__', '.pytest_cache'].includes(basename(source)) });
    write(project.directory, '.gitignore', 'target/\nbuild/\n.gradle/\n__pycache__/\n.pytest_cache/\n.coverage*\n');
    write(project.directory, definition.test, definition.baseline);
    git(project.directory, 'init', '-q');
    commit(project.directory, 'test: seed deliberately partial smoke baseline');
    requirePass(call(project, 'doctor', [], 'doctor'), 'Prerequisite doctor');
    requirePass(call(project, 'unit-status', ['--check'], 'baseline-status'), 'Baseline status');
    const before = requirePass(call(project, 'unit-coverage', [], 'baseline-coverage'), 'Baseline coverage');
    project.before = before.coverage[project.language].percent;
    project.target = project.before + 10;
    project.metric = before.coverage[project.language].metric;
    if (project.target > 100) throw new Error('Baseline has insufficient headroom for +10 percentage points');
    requirePass(call(project, 'install-skill', ['--agent', 'agents'], 'install-skill'), 'Skill installation');
    requirePass(call(project, 'unit-init', ['--check-only', '--skip-claude-commands'], 'onboarding-preview'), 'Onboarding preview');
    requirePass(call(project, 'unit-init', ['--skip-claude-commands'], 'onboarding'), 'Onboarding');
    commit(project.directory, 'chore: record smoke onboarding separately from test generation');
    project.branch = `testgen/unit-ollama-smoke-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 12)}`;
    git(project.directory, 'switch', '-c', project.branch);
    const sourceHash = hash(join(project.directory, definition.source));
    let previousFailure = '';
    const maxAttempts = project.language === 'python' ? 4 : 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[${project.language}] ${project.before.toFixed(2)}% baseline; asking ${model} for >=${project.target.toFixed(2)}% (attempt ${attempt})`);
      let goal = `Increase unit coverage by at least 10 percentage points, from ${project.before}% to at least ${project.target}%. Only edit ${definition.test}. Preserve the existing ${definition.baselineName} test. Add focused tests for valid discount results, percentage boundaries and invalid inputs. Return exactly one complete replacement ${definition.test} file in one fenced ${definition.fence} code block. Include necessary existing-library imports. No production/build/dependency changes. ${previousFailure ? `Repair the previous failed test batch. Diagnostic: ${previousFailure}` : ''}`;
      if (project.language === 'python' && attempt === 4) goal = `Repair the current Python test file. Source behavior is authoritative: type annotations do NOT enforce types, and discount does NOT reject fractional percentages. Remove that invented exception test. The review also found duplicate zero-discount tests. Return exactly one complete tests/test_price.py in a fenced python code block. Keep ONLY these five test functions: test_rejects_negative_total (preserve the original with pytest.raises(ValueError): discount(-1,20)), test_valid_discount (discount(100,20)==80), test_zero_discount (discount(100,0)==100), test_full_discount (discount(100,100)==0), test_rejects_invalid_percentage (pytest.raises(ValueError) for -1 and 101). Remove all other tests. Keep pytest and production imports. No production or build edits. Do not add float/type validation, duplicate assertions, mock logic or extra cases. These tests need to raise statement coverage from 75% to at least 85%.`;
      const reusedFile = process.env.SMOKE_REPLAY_DIR && attempt === 1 ? join(process.env.SMOKE_REPLAY_DIR, `${project.language}-generation-1.json`) : null;
      let generated;
      if (reusedFile && existsSync(reusedFile)) {
        const previous = JSON.parse(readFileSync(reusedFile, 'utf8'));
        generated = requirePass(previous, 'Previously captured model generation');
        project.reusedModelResponse = reusedFile;
        writeFileSync(join(reports, `${project.language}-generation-${attempt}.json`), JSON.stringify({ ...previous, reusedFrom: reusedFile }, null, 2) + '\n');
      } else {
        generated = requirePass(call(project, 'generate-unit-tests', ['--provider', 'ollama', '--model', model, '--api-key-env', 'TESTGEN_LOCAL_SMOKE_UNUSED', '--timeout', '600000', '--max-tokens', '2048', '--file', definition.source, '--file', definition.test, '--', goal], `generation-${attempt}`), 'Model generation');
      }
      const blocks = [...generated.suggestion.matchAll(/```[\w-]*[ \t]*\r?\n([\s\S]*?)```/g)];
      if (blocks.length !== 1 || !blocks[0][1].includes(definition.baselineName)) {
        previousFailure = `The last response was rejected before application. Return exactly one fenced complete test file. It MUST retain the existing test named ${definition.baselineName} alongside new tests. Do not rename, replace or omit it. Copy its original definition from the provided test source verbatim.`;
        console.log(`[${project.language}] Rejected response format or missing baseline test; asking the model to repair it`);
        continue;
      }
      write(project.directory, definition.test, blocks[0][1].trim() + '\n');
      if (hash(join(project.directory, definition.source)) !== sourceHash) throw new Error('Production source changed');
      const validation = call(project, 'validate-unit-tests', ['--forbid-source-changes'], `validation-${attempt}`);
      if (validation.exitCode !== 0) { previousFailure = JSON.stringify(validation.data).slice(-6000); continue; }
      const after = call(project, 'unit-coverage', ['--fail-under', String(project.target)], `coverage-${attempt}`);
      if (after.exitCode !== 0) { previousFailure = JSON.stringify(after.data).slice(-6000); continue; }
      const reviewed = call(project, 'review-unit-tests', ['--fail-on-issues'], `review-${attempt}`);
      if (reviewed.exitCode !== 0) { previousFailure = JSON.stringify(reviewed.data).slice(-6000); continue; }
      project.after = after.data.coverage[project.language].percent;
      project.increase = project.after - project.before;
      project.attempts = attempt;
      project.sourceUnchanged = hash(join(project.directory, definition.source)) === sourceHash;
      project.changedFiles = git(project.directory, 'diff', '--name-only', 'HEAD').split('\n').filter(Boolean);
      if (project.changedFiles.length !== 1 || project.changedFiles[0] !== definition.test) throw new Error('Unexpected changes outside the allowed test file');
      writeFileSync(join(reports, `${project.language}-tests.diff`), git(project.directory, 'diff', 'HEAD') + '\n');
      project.status = 'pass'; break;
    }
    if (project.status !== 'pass') throw new Error('Model batches did not meet validation, coverage and review gates within the retry limit');
    console.log(`[${project.language}] PASS ${project.before.toFixed(2)}% -> ${project.after.toFixed(2)}% (+${project.increase.toFixed(2)} points)`);
  } catch (error) {
    project.status = 'fail'; project.blocker = error.message;
    console.error(`[${project.language}] FAIL: ${error.message}`);
  }
  save();
}
report.finishedAt = new Date().toISOString();
report.status = report.projects.length > 0 && report.projects.every(p => p.status === 'pass') ? 'pass' : 'fail';
save();
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'pass') process.exitCode = 1;
