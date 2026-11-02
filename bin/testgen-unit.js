#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execute } from '../lib/workflow.js';

const commands = ['install-skill', 'doctor', 'unit-init', 'unit-status', 'generate-unit-tests', 'validate-unit-tests', 'unit-coverage', 'review-unit-tests'];
const options = {
  'target-dir': { type: 'string', short: 'd', default: '.' },
  language: { type: 'string', default: 'auto' }, module: { type: 'string' },
  package: { type: 'string' }, file: { type: 'string', multiple: true },
  exclude: { type: 'string', multiple: true }, python: { type: 'string' },
  runner: { type: 'string' }, base: { type: 'string' },
  agent: { type: 'string', default: 'all' }, provider: { type: 'string' },
  model: { type: 'string' }, 'base-url': { type: 'string' },
  'api-key-env': { type: 'string' }, 'max-tokens': { type: 'string' },
  timeout: { type: 'string', default: '120000' },
  'fail-under': { type: 'string' }, json: { type: 'boolean' },
  check: { type: 'boolean' }, 'check-only': { type: 'boolean' },
  'dry-run': { type: 'boolean' }, 'compile-only': { type: 'boolean' },
  'skip-coverage': { type: 'boolean' }, 'skip-claude-commands': { type: 'boolean' },
  'forbid-source-changes': { type: 'boolean' }, 'fail-on-issues': { type: 'boolean' },
  'fail-on-baseline': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
};
const help = `testgen-unit — Go, Java and Python unit testing for coding agents

Usage: testgen-unit <command> [options] [-- "goal"]
Commands: ${commands.join(', ')}

  -d, --target-dir DIR     Target repository (default: current directory)
  --language LANGUAGE     auto, go, java or python; choose explicitly for mixed repos
  --module PATH           Project path; '.' selects all discovered projects
  --exclude PATH          Exclude a project subtree (repeatable)
  --package PATTERN       Go package pattern (default ./...)
  --file PATH             Prompt source/test context (repeatable; relative to target)
  --python EXECUTABLE     Python interpreter, including an existing virtualenv
  --runner RUNNER         Python pytest (default) or unittest
  --agent NAME            Skill destination: all (default), agents, claude, opencode
  --provider NAME         Optional generation: ollama or openai-compatible
  --model NAME            Installed local model or API deployment name
  --base-url URL          Ollama server or compatible API base ending in /v1
  --api-key-env NAME      Read API key from this variable (default TESTGEN_API_KEY)
  --max-tokens NUMBER     Optional generation output limit (default 4096)
  --check                 Run compile/collection checks during unit-status
  --compile-only          Compile/collect instead of running tests in validation
  --check-only            Preview unit-init without writing files
  --dry-run               Emit generation instructions; never writes tests
  --skip-claude-commands  Do not add Claude command files during unit-init
  --skip-coverage         Static review only (does not execute project code)
  --forbid-source-changes Fail validation on changes outside test files
  --base REF              Git comparison ref (default HEAD plus untracked files)
  --fail-on-issues        Nonzero review exit status for new findings in changed files
  --fail-on-baseline      Include pre-existing findings in the review exit status
  --fail-under NUMBER     Minimum coverage percentage (0–100)
  --timeout MS            Timeout per subprocess (default 120000)
  --json                  Machine-readable result, including captured command output
  -h, --help              Show help
  -v, --version           Show version

Generation emits a prompt, or calls a model only with --provider. It never writes tests.
Coverage metrics differ by language; mixed-language totals are never averaged.
Validation, coverage and status --check execute target project code. Use trusted repos.
`;

try {
  const { values, positionals } = parseArgs({ options, allowPositionals: true });
  if (values.version) {
    console.log(JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')).version);
  } else if (values.help || !positionals.length) {
    console.log(help);
  } else {
    const [command, ...goal] = positionals;
    if (!commands.includes(command)) throw new Error(`Unknown command: ${command}. Use --help.`);
    const result = await execute(command, values, goal.join(' '));
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else if (result.prompt) console.log(result.prompt);
    else if (result.suggestion) { console.log(result.suggestion); console.error(result.warning); }
    else {
      console.log(`${command}: ${result.status}`);
      for (const project of result.projects ?? []) {
        console.log(`${project.path} (${project.language}): ${project.status}${project.coveragePercent == null ? '' : ` — ${project.coveragePercent.toFixed(2)}% ${project.metric}`}`);
        if (project.blocker) console.log(`  ${project.blocker}`);
        for (const run of project.runs ?? []) if (run.output) console.log(run.output.trimEnd());
      }
      for (const finding of result.findings ?? []) console.log(`${finding.baseline ? '[baseline] ' : ''}${finding.file ?? ''}: ${finding.category}: ${finding.message}`);
      for (const warning of result.warnings ?? []) console.log(`Warning: ${warning}`);
      for (const file of result.created ?? []) console.log(`Created: ${file}`);
      for (const file of result.skipped ?? []) console.log(`Preserved: ${file}`);
      for (const file of result.planned ?? []) console.log(`Would create: ${file}`);
      for (const [language, total] of Object.entries(result.coverage ?? {})) console.log(`${language}: ${total.percent == null ? 'unavailable' : `${total.percent.toFixed(2)}% ${total.metric}`} (${total.measuredProjects}/${total.projects} projects measured)`);
    }
    if (result.status === 'fail' || result.status === 'blocked') process.exitCode = 1;
  }
} catch (error) {
  const json = process.argv.includes('--json');
  if (json) console.log(JSON.stringify({ status: 'blocked', error: error.message }));
  else console.error(`testgen-unit: ${error.message}`);
  process.exitCode = 1;
}
