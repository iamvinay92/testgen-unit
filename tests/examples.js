import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const language = process.env.EXAMPLE_LANGUAGE;
if (!['go', 'java', 'python'].includes(language)) throw new Error('Set EXAMPLE_LANGUAGE=go, java or python');
const examples = language === 'java' ? ['java-maven', 'java-gradle'] : [language];
for (const example of examples) {
  for (const command of ['unit-status', 'validate-unit-tests', 'unit-coverage']) {
    const args = [resolve(root, 'bin/testgen-unit.js'), command, '-d', resolve(root, 'examples', example), '--language', language, '--json'];
    if (command === 'unit-status') args.push('--check');
    if (command === 'unit-coverage') args.push('--fail-under', '75');
    if (language === 'python' && process.env.EXAMPLE_PYTHON) args.push('--python', process.env.EXAMPLE_PYTHON);
    const child = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 300000 });
    if (child.error || child.status !== 0) { process.stdout.write(child.stdout ?? ''); process.stderr.write(child.stderr ?? ''); process.exit(child.status || 1); }
    const result = JSON.parse(child.stdout);
    console.log(JSON.stringify({ example, command, status: result.status, coverage: result.coverage }));
  }
}
if (language === 'python') {
  const child = spawnSync(process.execPath, [resolve(root, 'bin/testgen-unit.js'), 'unit-coverage', '-d', resolve(root, 'examples/python'), '--runner', 'unittest', '--fail-under', '75', '--json', ...(process.env.EXAMPLE_PYTHON ? ['--python', process.env.EXAMPLE_PYTHON] : [])], { encoding: 'utf8', timeout: 120000 });
  if (child.error || child.status !== 0) { process.stdout.write(child.stdout ?? ''); process.stderr.write(child.stderr ?? ''); process.exit(child.status || 1); }
  const result = JSON.parse(child.stdout);
  console.log(JSON.stringify({ example: 'python-unittest', command: 'unit-coverage', status: result.status, coverage: result.coverage }));
}
