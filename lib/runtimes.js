import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { inside, unix } from './projects.js';

export function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', shell: false, timeout: Number(options.timeout ?? 120000),
    maxBuffer: 32 * 1024 * 1024, env: { ...process.env, ...options.env },
  });
  return {
    command: [command, ...args], code: result.status,
    status: result.error || result.status !== 0 ? 'fail' : 'pass',
    stdout: result.stdout ?? '', stderr: result.stderr ?? '',
    output: [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'),
  };
}
const successful = runs => runs.every(r => r.status === 'pass');
const outcome = (project, runs, extra = {}) => ({
  path: project.path, language: project.language,
  status: successful(runs) ? 'pass' : 'fail', runs, ...extra,
});
export const pythonExecutable = (project, options) => {
  if (options.python) return options.python;
  const local = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
  if (existsSync(join(project.dir, local))) return join(project.dir, local);
  if (process.env.VIRTUAL_ENV) return join(process.env.VIRTUAL_ENV, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return process.platform === 'win32' ? 'python' : 'python3';
};
function pythonArgs(project, options, settings, collect = false) {
  const runner = options.runner ?? settings.pythonRunner ?? 'pytest';
  if (!['pytest', 'unittest'].includes(runner)) throw new Error('runner must be pytest or unittest');
  const testDir = settings.pythonTestDir ?? (existsSync(join(project.dir, 'tests')) ? 'tests' : '.');
  inside(project.dir, testDir);
  if (runner === 'unittest') {
    if (collect) throw new Error('unittest has no collection-only mode; omit --compile-only to run discovery and tests');
    if (project.excludes.some(p => testDir === '.' || p === testDir || p.startsWith(`${testDir}/`) || testDir.startsWith(`${p}/`))) throw new Error('unittest cannot safely exclude discovery subtrees; narrow pythonTestDir or use pytest');
    return ['-m', 'unittest', 'discover', '-s', testDir];
  }
  const args = ['-m', 'pytest', '-q', ...(collect ? ['--collect-only'] : [])];
  for (const excluded of project.excludes) args.push(`--ignore=${excluded}`);
  return args;
}
function goPackages(project, options) {
  const listing = run('go', ['list', '-f', '{{.Dir}}', options.package ?? './...'], project.dir, options);
  if (listing.status !== 'pass') return { runs: [listing], packages: [] };
  const packages = listing.stdout.trim().split(/\r?\n/).filter(Boolean).filter(dir => {
    const rel = unix(relative(project.dir, dir));
    inside(project.dir, dir);
    return !project.excludes.some(p => rel === p || rel.startsWith(`${p}/`));
  }).map(dir => { const rel = unix(relative(project.dir, dir)); return rel ? `./${rel}` : '.'; });
  if (!packages.length) throw new Error(`No Go packages remain in ${project.path}`);
  return { runs: [], packages };
}
function javaTool(project, root) {
  const maven = existsSync(join(project.dir, 'pom.xml'));
  if (maven && (existsSync(join(project.dir, 'build.gradle')) || existsSync(join(project.dir, 'build.gradle.kts')))) throw new Error(`Both Maven and Gradle descriptors found in ${project.path}`);
  let directory = project.dir;
  const wrapper = maven ? 'mvnw' : 'gradlew';
  while (true) {
    const candidate = join(directory, wrapper);
    if (existsSync(candidate)) {
      inside(root, candidate);
      return { command: candidate, prefix: maven ? ['-B', '-f', join(project.dir, 'pom.xml')] : ['--no-daemon', '-p', project.dir], maven };
    }
    if (directory === root) break;
    directory = dirname(directory);
    if (!directory.startsWith(root)) break;
  }
  return { command: maven ? 'mvn' : 'gradle', prefix: maven ? ['-B'] : ['--no-daemon'], maven };
}
export function check(project, options, settings, root, mode = 'validate') {
  const runs = [];
  const compile = mode === 'compile';
  if (project.language === 'go') {
    const scope = goPackages(project, options);
    runs.push(...scope.runs);
    if (!runs.length) runs.push(run('go', ['test', ...(compile ? ['-run', '^$'] : []), ...scope.packages], project.dir, options));
  } else if (project.language === 'python') {
    runs.push(run(pythonExecutable(project, options), pythonArgs(project, options, settings, compile), project.dir, options));
    if ((options.runner ?? settings.pythonRunner) === 'unittest' && /Ran 0 tests\b/.test(runs[0].output)) return outcome(project, runs, { status: 'fail', blocker: 'No unittest tests discovered' });
  } else {
    const tool = javaTool(project, root);
    runs.push(run(tool.command, [...tool.prefix, tool.maven ? (compile ? 'test-compile' : 'test') : (compile ? 'testClasses' : 'test')], project.dir, options));
  }
  return outcome(project, runs);
}
export function coverage(project, options, settings, root) {
  const directory = mkdtempSync(join(tmpdir(), 'testgen-unit-'));
  const runs = [];
  const unavailable = blocker => outcome(project, runs, { status: successful(runs) ? 'unavailable' : 'fail', blocker, coveragePercent: null });
  try {
    let covered = 0, total = 0, metric;
    if (project.language === 'go') {
      const scope = goPackages(project, options);
      runs.push(...scope.runs);
      if (runs.length) return unavailable('Go package discovery failed');
      const profile = join(directory, 'coverage.out');
      runs.push(run('go', ['test', '-count=1', '-covermode=count', `-coverprofile=${profile}`, ...scope.packages], project.dir, options));
      if (!successful(runs)) return unavailable('Go coverage test run failed');
      for (const line of readFileSync(profile, 'utf8').trim().split(/\r?\n/).slice(1)) {
        const match = line.match(/\s+(\d+)\s+(\d+)$/);
        if (!match) throw new Error(`Invalid Go coverage profile line: ${line}`);
        total += Number(match[1]);
        if (Number(match[2]) > 0) covered += Number(match[1]);
      }
      metric = 'statements';
    } else if (project.language === 'python') {
      const python = pythonExecutable(project, options);
      const report = join(directory, 'coverage.json');
      const args = pythonArgs(project, options, settings);
      const sources = settings.pythonSources ?? ['.'];
      for (const source of sources) inside(project.dir, source);
      const omit = ['*/tests/*', '*/test/*', '*/test_*.py', '*/*_test.py', '*/conftest.py', ...project.excludes.flatMap(p => [`${resolve(project.dir, p)}/*`])];
      const opts = { ...options, env: { COVERAGE_FILE: join(directory, '.coverage') } };
      runs.push(run(python, ['-m', 'coverage', 'run', `--source=${sources.join(',')}`, `--omit=${omit.join(',')}`, ...args], project.dir, opts));
      if (!successful(runs)) return unavailable('Python coverage run failed; install coverage.py and the selected runner in the target environment');
      if ((options.runner ?? settings.pythonRunner) === 'unittest' && /Ran 0 tests\b/.test(runs[0].output)) return outcome(project, runs, { status: 'fail', blocker: 'No unittest tests discovered', coveragePercent: null });
      runs.push(run(python, ['-m', 'coverage', 'json', '-o', report], project.dir, opts));
      if (!successful(runs)) return unavailable('Python coverage report failed');
      const data = JSON.parse(readFileSync(report, 'utf8'));
      // Compute statements explicitly, even if project settings enable branch coverage.
      covered = data.totals.covered_lines;
      total = data.totals.num_statements;
      metric = 'statements';
    } else {
      const tool = javaTool(project, root);
      const descriptor = join(project.dir, tool.maven ? 'pom.xml' : (existsSync(join(project.dir, 'build.gradle.kts')) ? 'build.gradle.kts' : 'build.gradle'));
      const text = readFileSync(descriptor, 'utf8');
      // A parent may own the plugin; inspect ancestors, but never inject a build dependency.
      let config = text, parent = dirname(project.dir);
      while (parent.startsWith(root) && parent !== project.dir) {
        for (const file of ['pom.xml', 'build.gradle', 'build.gradle.kts']) if (existsSync(join(parent, file))) config += readFileSync(join(parent, file), 'utf8');
        if (parent === root) break;
        parent = dirname(parent);
      }
      if (!/jacoco/i.test(config)) return unavailable('No existing JaCoCo configuration; build files were not changed');
      const started = Date.now();
      runs.push(run(tool.command, [...tool.prefix, ...(tool.maven ? [] : ['--rerun-tasks']), 'test', tool.maven ? 'jacoco:report' : 'jacocoTestReport'], project.dir, options));
      if (!successful(runs)) return unavailable('Java coverage build failed');
      const path = join(project.dir, tool.maven ? 'target/site/jacoco/jacoco.xml' : 'build/reports/jacoco/test/jacocoTestReport.xml');
      if (!existsSync(path) || statSync(path).mtimeMs < started) return unavailable('No fresh JaCoCo XML at the standard report path; enable XML output in your existing build');
      inside(root, path);
      const counters = [...readFileSync(path, 'utf8').matchAll(/<counter\b([^>]+)\/?\s*>/g)].map(m => Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(a => [a[1], a[2]]))).filter(c => c.type === 'LINE');
      const counter = counters.at(-1);
      if (!counter) return unavailable('No LINE counter in JaCoCo XML');
      covered = Number(counter.covered); total = covered + Number(counter.missed); metric = 'lines';
    }
    if (!Number.isFinite(covered) || !Number.isFinite(total) || covered < 0 || total <= 0 || covered > total) return unavailable('No measurable production statements/lines');
    return outcome(project, runs, { covered, total, metric, coveragePercent: covered / total * 100 });
  } catch (error) {
    return outcome(project, runs, { status: 'fail', blocker: error.message, coveragePercent: null });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
export function doctor(project, options, settings, root) {
  const runs = [run('git', ['--version'], project.dir, options)];
  if (project.language === 'go') runs.push(run('go', ['version'], project.dir, options), run('gofmt', ['-h'], project.dir, options));
  if (project.language === 'python') {
    const python = pythonExecutable(project, options);
    runs.push(run(python, ['--version'], project.dir, options));
    if ((options.runner ?? settings.pythonRunner ?? 'pytest') === 'pytest') runs.push(run(python, ['-m', 'pytest', '--version'], project.dir, options));
    runs.push(run(python, ['-m', 'coverage', '--version'], project.dir, options));
  }
  if (project.language === 'java') {
    runs.push(run('java', ['-version'], project.dir, options));
    const tool = javaTool(project, root);
    runs.push(run(tool.command, [...tool.prefix, '--version'], project.dir, options));
  }
  return outcome(project, runs);
}
export function aggregate(projects) {
  const result = {};
  for (const project of projects) {
    const group = result[project.language] ??= { metric: project.metric ?? (project.language === 'java' ? 'lines' : 'statements'), covered: 0, total: 0, measuredProjects: 0, projects: 0, percent: null };
    group.projects++;
    if (project.status !== 'pass' || project.coveragePercent == null) continue;
    group.covered += project.covered; group.total += project.total; group.measuredProjects++;
  }
  for (const group of Object.values(result)) if (group.measuredProjects === group.projects && group.total) group.percent = group.covered / group.total * 100;
  return result;
}
