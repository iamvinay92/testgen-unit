import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discover, inside } from '../lib/projects.js';
import { aggregate, parseSkipped, run } from '../lib/runtimes.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'bin/testgen-unit.js');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'testgen-unit-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function write(dir, file, content = '', mode = 0o644) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), content, { mode });
}
function invoke(dir, args, env = {}) {
  const separator = args.indexOf('--');
  const argv = separator < 0 ? [...args, '-d', dir, '--json'] : [...args.slice(0, separator), '-d', dir, '--json', ...args.slice(separator)];
  const child = spawnSync(process.execPath, [cli, ...argv], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 30000 });
  assert.ifError(child.error);
  return { code: child.status, data: JSON.parse(child.stdout), stderr: child.stderr };
}
function go(dir) { write(dir, 'go.mod', 'module example.com/fixture\ngo 1.22\n'); write(dir, 'price.go', 'package price\nfunc Value() int { return 1 }'); }
function git(dir, ...args) {
  const child = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
}
function committed(dir) {
  git(dir, 'init', '-q'); git(dir, 'add', '.');
  git(dir, '-c', 'user.name=Test Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Test fixture\n\nCo-authored-by: Codex <noreply@openai.com>');
}
function fakeGo(dir) {
  const bin = join(dir, 'tools');
  write(dir, 'tools/go', `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path'); const args = process.argv.slice(2);
if (args[0] === 'list') console.log(process.cwd());
else if (process.env.FAKE_FAIL === '1') { console.error('baseline compilation failed'); process.exitCode = 2; }
else { const flag = args.find(a => a.startsWith('-coverprofile=')); if (flag) fs.writeFileSync(flag.slice(14), 'mode: count\\nexample.com/fixture/price.go:1.1,2.1 3 1\\nexample.com/fixture/price.go:3.1,4.1 1 0\\n'); }
`, 0o755);
  return { PATH: `${bin}:${process.env.PATH}` };
}

test('help, version and unknown commands have useful exit statuses', t => {
  const dir = fixture(t);
  const version = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
  assert.equal(version.status, 0); assert.equal(version.stdout.trim(), pkg.version);
  assert.match(spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }).stdout, /Python/);
  const result = invoke(dir, ['not-a-command']);
  assert.equal(result.code, 1); assert.match(result.data.error, /Unknown command/);
});

test('discovers all runtimes, requires explicit mixed-language selection, honors exclusions', t => {
  const dir = fixture(t); go(dir);
  write(dir, 'py/pyproject.toml'); write(dir, 'py/price.py'); write(dir, 'java/pom.xml');
  assert.throws(() => discover(dir), /Mixed-language/);
  assert.deepEqual(discover(dir, { language: 'python' }).projects.map(p => p.path), ['py']);
  assert.deepEqual(discover(dir, { language: 'java' }).projects.map(p => p.path), ['java']);
  assert.throws(() => discover(dir, { language: 'python', exclude: ['py'] }), /No matching/);
  write(dir, '.testgen/config.json', JSON.stringify({ unitExcludes: ['py', 'java'] }));
  assert.equal(discover(dir).projects[0].language, 'go');
});

test('nested projects have separate context and exact module selection', t => {
  const dir = fixture(t); go(dir); write(dir, 'sdk/go.mod', 'module example.com/sdk'); write(dir, 'sdk/sdk.go', 'package sdk');
  const context = discover(dir, { language: 'go' });
  assert.equal(context.projects.length, 2);
  assert.ok(!context.projects[0].files.includes('sdk/sdk.go'));
  assert.deepEqual(discover(dir, { language: 'go', module: 'sdk' }).projects.map(p => p.path), ['sdk']);
  assert.throws(() => discover(dir, { module: 'missing' }), /No matching/);
});

test('rejects traversal and symlinks escaping the selected target', t => {
  const dir = fixture(t); const external = fixture(t); go(dir);
  assert.throws(() => inside(dir, '../outside'), /escapes target/);
  symlinkSync(external, join(dir, 'link'));
  assert.throws(() => inside(dir, 'link/new.md'), /Symlink escapes/);
  assert.equal(invoke(dir, ['unit-init', '--module', '../outside']).code, 1);
});

test('onboarding previews changes and preserves customized guidance on every run', t => {
  const dir = fixture(t); go(dir);
  write(dir, 'AGENTS.md', 'User instructions\n'); write(dir, '.testgen/prompts/generate-unit-tests.md', 'Custom prompt\n');
  const preview = invoke(dir, ['unit-init', '--check-only']);
  assert.equal(preview.code, 0); assert.ok(preview.data.planned.includes('.testgen/prompts/review-unit-tests.md'));
  assert.ok(!existsSync(join(dir, '.testgen/prompts/review-unit-tests.md')));
  assert.equal(invoke(dir, ['unit-init', '--skip-claude-commands']).code, 0);
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), 'User instructions\n');
  assert.equal(readFileSync(join(dir, '.testgen/prompts/generate-unit-tests.md'), 'utf8'), 'Custom prompt\n');
  assert.ok(!existsSync(join(dir, '.claude')));
  assert.equal(invoke(dir, ['unit-init', '--skip-claude-commands']).data.created.length, 0);
});

test('generation emits real scoped context without writing tests', t => {
  const dir = fixture(t); go(dir);
  const result = invoke(dir, ['generate-unit-tests', '--dry-run', '--file', 'price.go', '--', 'Cover validation']);
  assert.equal(result.code, 0); assert.match(result.data.prompt, /func Value/);
  assert.match(result.data.prompt, /Cover validation/); assert.match(result.data.prompt, /UNTRUSTED SOURCE/);
  assert.match(result.data.prompt, /1 \| package price/); assert.match(result.data.prompt, /reference-only/);
  assert.ok(!existsSync(join(dir, 'price_test.go')));
  assert.equal(invoke(dir, ['generate-unit-tests', '--file', '../outside']).code, 1);
});

test('Go coverage uses statement counts, enforces thresholds and propagates baseline errors', t => {
  const dir = fixture(t); go(dir); const env = fakeGo(dir);
  const result = invoke(dir, ['unit-coverage', '--fail-under', '75'], env);
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.equal(result.data.coverage.go.percent, 75); assert.equal(result.data.coverage.go.total, 4);
  assert.equal(invoke(dir, ['unit-coverage', '--fail-under', '76'], env).code, 1);
  const fail = invoke(dir, ['unit-status', '--check'], { ...env, FAKE_FAIL: '1' });
  assert.equal(fail.code, 1); assert.match(fail.data.projects[0].runs[0].output, /compilation failed/);
  assert.equal(invoke(dir, ['unit-coverage'], { ...env, FAKE_FAIL: '1' }).data.coverage.go.percent, null);
});

test('Go package scope reaches the subprocess as one argument', t => {
  const dir = fixture(t); go(dir); const env = fakeGo(dir);
  const result = invoke(dir, ['validate-unit-tests', '--package', './...'], env);
  assert.equal(result.code, 0); assert.deepEqual(result.data.projects[0].runs[0].command, ['go', 'test', '.']);
});

test('missing executable and process timeout are failures, not successful checks', t => {
  const dir = fixture(t);
  assert.equal(run('testgen-unit-definitely-not-installed', [], dir).status, 'fail');
  const timed = run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], dir, { timeout: 50 });
  assert.equal(timed.status, 'fail'); assert.match(timed.output, /ETIMEDOUT/);
});

test('coverage totals are weighted and incomplete groups never report a total', () => {
  const result = aggregate([
    { language: 'go', status: 'pass', covered: 1, total: 2, coveragePercent: 50, metric: 'statements' },
    { language: 'go', status: 'pass', covered: 9, total: 10, coveragePercent: 90, metric: 'statements' },
    { language: 'java', status: 'unavailable', coveragePercent: null },
  ]);
  assert.equal(result.go.percent, 10 / 12 * 100); assert.equal(result.java.percent, null);
  assert.equal(aggregate([{ language: 'go', status: 'pass', covered: 1, total: 1, coveragePercent: 100 }, { language: 'go', status: 'fail' }]).go.percent, null);
});

test('skip parsing understands pytest, unittest and Maven summaries', () => {
  assert.equal(parseSkipped('748 passed, 132 skipped in 12.35s'), 132);
  assert.equal(parseSkipped('\x1b[32mOK (skipped=2)\x1b[0m'), 2);
  assert.equal(parseSkipped('Tests run: 4, Failures: 0, Errors: 0, Skipped: 1'), 1);
  assert.equal(parseSkipped('no skipped tests'), 0);
});

test('Git guard catches staged source edits and untracked source files but accepts tests', t => {
  const dir = fixture(t); go(dir); committed(dir);
  write(dir, 'price_test.go', 'package price\n');
  assert.equal(invoke(dir, ['review-unit-tests', '--skip-coverage']).data.findings.some(f => f.category === 'non-test-change'), false);
  write(dir, 'price.go', 'package price\nfunc Changed() {}'); git(dir, 'add', 'price.go');
  write(dir, 'secret.txt', 'placeholder');
  const result = invoke(dir, ['validate-unit-tests', '--forbid-source-changes']);
  assert.equal(result.code, 1);
  assert.deepEqual(result.data.findings.map(f => f.file).sort(), ['price.go', 'secret.txt']);
  assert.equal(invoke(dir, ['review-unit-tests', '--skip-coverage', '--base', 'does-not-exist']).code, 1);
});

test('Go review finds real sleeps and package duplicate test names but ignores comments', t => {
  const dir = fixture(t); go(dir); committed(dir);
  write(dir, 'price_test.go', 'package price\n// time.Sleep(1)\nfunc TestPrice(t *testing.T) { t.Fatal("example") }');
  assert.equal(invoke(dir, ['review-unit-tests', '--skip-coverage', '--fail-on-issues']).code, 0);
  write(dir, 'other_test.go', 'package price\nfunc TestPrice(t *testing.T) { time.Sleep(1) }');
  const result = invoke(dir, ['review-unit-tests', '--skip-coverage', '--fail-on-issues']);
  assert.equal(result.code, 1);
  assert.ok(result.data.findings.some(f => f.category === 'duplicate-test'));
  assert.ok(result.data.findings.some(f => f.category === 'nondeterminism'));
});

test('review treats committed findings as baseline while gating new changes', t => {
  const dir = fixture(t); go(dir);
  write(dir, 'price_test.go', 'package price\nfunc TestPrice(t *testing.T) {}\n');
  committed(dir);
  let result = invoke(dir, ['review-unit-tests', '--skip-coverage', '--fail-on-issues']);
  assert.equal(result.code, 0);
  assert.ok(result.data.findings.some(f => f.category === 'weak-assertion' && f.baseline === true));
  assert.equal(invoke(dir, ['review-unit-tests', '--skip-coverage', '--fail-on-issues', '--fail-on-baseline']).code, 1);
  write(dir, 'price_test.go', 'package price\nfunc TestPrice(t *testing.T) {}\n// changed\n');
  result = invoke(dir, ['review-unit-tests', '--skip-coverage', '--fail-on-issues']);
  assert.equal(result.code, 1);
  assert.ok(result.data.findings.every(f => f.baseline === false));
});

test('review ignores managed onboarding files but still flags customized guidance', t => {
  const dir = fixture(t); go(dir); committed(dir);
  assert.equal(invoke(dir, ['unit-init', '--skip-claude-commands']).code, 0);
  assert.equal(invoke(dir, ['install-skill', '--agent', 'all']).code, 0);
  let result = invoke(dir, ['review-unit-tests', '--skip-coverage', '--fail-on-issues']);
  assert.equal(result.code, 0);
  assert.equal(result.data.findings.filter(f => f.category === 'non-test-change').length, 0);
  write(dir, 'AGENTS.md', 'Custom user guidance\n');
  result = invoke(dir, ['review-unit-tests', '--skip-coverage', '--fail-on-issues']);
  assert.equal(result.code, 1);
  assert.ok(result.data.findings.some(f => f.file === 'AGENTS.md' && f.baseline === false));
});

test('Python static review uses AST and detects shadowed tests and syntax errors', t => {
  const python = spawnSync('python3', ['--version']); if (python.status !== 0) { t.skip('python3 unavailable'); return; }
  const dir = fixture(t); write(dir, 'pyproject.toml'); write(dir, 'price.py', 'def value(): return 1\n'); committed(dir);
  write(dir, 'tests/test_price.py', 'import time\ndef test_value():\n    assert True\ndef test_value():\n    time.sleep(1)\n');
  let result = invoke(dir, ['review-unit-tests', '--skip-coverage', '--fail-on-issues']);
  assert.equal(result.code, 1);
  assert.deepEqual(new Set(result.data.findings.map(f => f.category)), new Set(['duplicate-test', 'weak-assertion', 'nondeterminism']));
  write(dir, 'tests/test_price.py', 'def test_broken(:\n');
  result = invoke(dir, ['review-unit-tests', '--skip-coverage', '--fail-on-issues']);
  assert.ok(result.data.findings.some(f => f.category === 'syntax'));
});

test('Python review flags identical test bodies but distinguishes fixture parameters and decorators', t => {
  if (spawnSync('python3', ['--version']).status !== 0) { t.skip('python3 unavailable'); return; }
  const dir = fixture(t); write(dir, 'pyproject.toml'); write(dir, 'price.py', 'def value(): return 1\n'); committed(dir);
  write(dir, 'tests/test_price.py', 'from price import value\ndef test_first():\n    assert value() == 1\ndef test_second():\n    """Duplicate with a different description."""\n    assert value() == 1\ndef test_fixture(custom_fixture):\n    assert value() == 1\n@different_marker\ndef test_marked():\n    assert value() == 1\n');
  const result = invoke(dir, ['review-unit-tests', '--skip-coverage', '--fail-on-issues']);
  assert.equal(result.code, 1);
  const duplicates = result.data.findings.filter(f => f.category === 'duplicate-test-body');
  assert.equal(duplicates.length, 1); assert.match(duplicates[0].message, /test_second.*test_first/);
});

test('Python status forwards interpreter errors and rejects invalid runner/configuration', t => {
  const dir = fixture(t); write(dir, 'pyproject.toml');
  assert.equal(invoke(dir, ['unit-status', '--check', '--python', '/no-such-python']).code, 1);
  assert.equal(invoke(dir, ['validate-unit-tests', '--runner', 'unknown']).code, 1);
  assert.equal(invoke(dir, ['validate-unit-tests', '--runner', 'unittest', '--compile-only']).code, 1);
  assert.equal(invoke(dir, ['unit-coverage', '--package', './...']).code, 1);
  write(dir, '.testgen/config.json', '{"pythonSources": "src"}');
  assert.equal(invoke(dir, ['unit-coverage']).code, 1);
});

test('Python coverage surfaces skipped tests and warns about under-reporting', t => {
  const dir = fixture(t); write(dir, 'pyproject.toml'); write(dir, 'price.py', 'def value(): return 1\n');
  write(dir, 'tools/python', `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('json')) {
  const index = args.indexOf('-o');
  fs.writeFileSync(args[index + 1], JSON.stringify({ totals: { covered_lines: 3, num_statements: 4 } }));
} else {
  console.log('1 passed, 2 skipped in 0.01s');
}
`, 0o755);
  const result = invoke(dir, ['unit-coverage', '--python', join(dir, 'tools/python')]);
  assert.equal(result.code, 0);
  assert.equal(result.data.projects[0].skippedTests, 2);
  assert.match(result.data.warnings[0], /2 tests skipped/);
});

test('failed runs include the underlying error in the blocker', t => {
  const dir = fixture(t); write(dir, 'pyproject.toml'); write(dir, 'price.py', 'def value(): return 1\n');
  write(dir, 'tools/python', `#!/usr/bin/env node
console.error('______________________ ERROR collecting tests/test_app.py ______________________');
console.error("E   ModuleNotFoundError: No module named 'freezegun'");
process.exitCode = 2;
`, 0o755);
  const python = join(dir, 'tools/python');
  const coverage = invoke(dir, ['unit-coverage', '--python', python]);
  assert.equal(coverage.code, 1);
  assert.match(coverage.data.projects[0].blocker, /ModuleNotFoundError/);
  assert.match(coverage.data.projects[0].blocker, /freezegun/);
  assert.doesNotMatch(coverage.data.projects[0].blocker, /install coverage\.py/);
  assert.doesNotMatch(coverage.data.projects[0].blocker, /ERROR collecting/);
  const validate = invoke(dir, ['validate-unit-tests', '--python', python]);
  assert.equal(validate.code, 1);
  assert.match(validate.data.projects[0].blocker, /freezegun/);
});

test('Java Maven wrapper dispatch and JaCoCo counters use fresh XML only', t => {
  const dir = fixture(t); write(dir, 'pom.xml', '<project><plugin>jacoco-maven-plugin</plugin></project>');
  write(dir, 'mvnw', `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path'); const args = process.argv.slice(2);
if (process.env.FAKE_FAIL === '1') process.exit(3);
if (args.includes('jacoco:report') && process.env.FAKE_STALE !== '1') {
 fs.mkdirSync('target/site/jacoco', {recursive:true});
 fs.writeFileSync('target/site/jacoco/jacoco.xml', '<report><package><counter type="LINE" covered="1" missed="9"/></package><counter missed="1" type="LINE" covered="3"/></report>');
}
`, 0o755);
  const valid = invoke(dir, ['validate-unit-tests']);
  assert.equal(valid.code, 0); assert.ok(valid.data.projects[0].runs[0].command.includes('test'));
  const result = invoke(dir, ['unit-coverage']);
  assert.equal(result.code, 0); assert.equal(result.data.coverage.java.percent, 75);
  utimesSync(join(dir, 'target/site/jacoco/jacoco.xml'), new Date(0), new Date(0));
  const stale = invoke(dir, ['unit-coverage'], { FAKE_STALE: '1' });
  assert.equal(stale.code, 1); assert.match(stale.data.projects[0].blocker, /fresh/);
  assert.equal(invoke(dir, ['unit-coverage'], { FAKE_FAIL: '1' }).code, 1);
});

test('Java without JaCoCo reports unavailable rather than a measured zero', t => {
  const dir = fixture(t); write(dir, 'pom.xml', '<project/>');
  const result = invoke(dir, ['unit-coverage']);
  assert.equal(result.code, 1); assert.equal(result.data.projects[0].status, 'unavailable');
  assert.equal(result.data.coverage.java.percent, null);
});

test('invalid numeric flags and unknown options fail explicitly', t => {
  const dir = fixture(t); go(dir);
  for (const args of [['unit-coverage', '--fail-under', '101'], ['unit-status', '--timeout', '0'], ['unit-status', '--invented-option']]) assert.equal(invoke(dir, args).code, 1);
});

test('skill installation previews additions and preserves existing skills', t => {
  const dir = fixture(t);
  assert.equal(invoke(dir, ['install-skill', '--agent', 'all', '--check-only']).data.planned.length, 3);
  assert.ok(!existsSync(join(dir, '.agents')));
  assert.equal(invoke(dir, ['install-skill', '--agent', 'opencode']).data.created.length, 1);
  const file = '.opencode/skills/testgen-unit-tests/SKILL.md';
  assert.match(readFileSync(join(dir, file), 'utf8'), /Python/);
  write(dir, file, 'Custom skill');
  assert.equal(invoke(dir, ['install-skill', '--agent', 'all']).data.skipped.length, 1);
  assert.equal(readFileSync(join(dir, file), 'utf8'), 'Custom skill');
  assert.equal(invoke(dir, ['install-skill', '--agent', 'unknown']).code, 1);
});

test('dry run never contacts a selected model endpoint', t => {
  const dir = fixture(t); go(dir);
  const result = invoke(dir, ['generate-unit-tests', '--dry-run', '--provider', 'ollama', '--base-url', 'http://127.0.0.1:1']);
  assert.equal(result.code, 0); assert.match(result.data.prompt, /production behavior/);
  assert.equal(invoke(dir, ['unit-coverage', '--provider', 'ollama']).code, 1);
});

test('Git review inside a repository subdirectory ignores sibling source changes', t => {
  const dir = fixture(t); go(join(dir, 'app')); go(join(dir, 'other')); committed(dir);
  write(dir, 'other/price.go', 'package other\nfunc Changed() {}');
  const result = invoke(join(dir, 'app'), ['review-unit-tests', '--skip-coverage', '--fail-on-issues']);
  assert.equal(result.code, 0); assert.equal(result.data.findings.length, 0);
});

test('unittest rejects empty suites and unsafe discovery exclusions', t => {
  if (spawnSync('python3', ['--version']).status !== 0) { t.skip('python3 unavailable'); return; }
  const dir = fixture(t); write(dir, 'pyproject.toml'); write(dir, 'tests/helper.py', '');
  const empty = invoke(dir, ['validate-unit-tests', '--runner', 'unittest']);
  assert.equal(empty.code, 1); assert.match(empty.data.projects[0].blocker, /No unittest tests/);
  write(dir, '.testgen/config.json', JSON.stringify({ unitExcludes: ['tests/integration'] }));
  const result = invoke(dir, ['validate-unit-tests', '--runner', 'unittest']);
  assert.equal(result.code, 1); assert.match(result.data.projects[0].blocker, /cannot safely exclude/);
});
