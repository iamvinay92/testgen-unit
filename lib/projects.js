import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, join, isAbsolute, sep } from 'node:path';

const ignored = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', 'vendor', 'build', 'target', '.gradle', '.tox', '.nox', 'dist', '.testgen', '.pytest_cache', '.mypy_cache']);
export const unix = path => path.split(sep).join('/');
export function inside(root, path = '.') {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Path escapes target: ${path}`);
  let existing = absolute;
  while (!existsSync(existing)) existing = resolve(existing, '..');
  const actual = relative(realpathSync(root), realpathSync(existing));
  if (actual === '..' || actual.startsWith(`..${sep}`) || isAbsolute(actual)) throw new Error(`Symlink escapes target: ${path}`);
  return absolute;
}
export function walk(root, excludes = []) {
  const paths = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(directory, entry.name);
      const rel = unix(relative(root, absolute));
      if (excludes.some(value => rel === value || rel.startsWith(`${value}/`))) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { if (!ignored.has(entry.name)) visit(absolute); }
      else if (entry.isFile()) paths.push(rel);
    }
  };
  visit(root);
  return paths;
}
export function loadSettings(root) {
  const file = join(root, '.testgen/config.json');
  if (!existsSync(file)) return {};
  const data = JSON.parse(readFileSync(inside(root, '.testgen/config.json'), 'utf8'));
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Expected an object in .testgen/config.json');
  if (data.unitExcludes && (!Array.isArray(data.unitExcludes) || data.unitExcludes.some(p => typeof p !== 'string' || !p))) throw new Error('unitExcludes must be an array of nonempty paths');
  if (data.pythonRunner && !['pytest', 'unittest'].includes(data.pythonRunner)) throw new Error('pythonRunner must be pytest or unittest');
  if (data.pythonSources && (!Array.isArray(data.pythonSources) || !data.pythonSources.length || data.pythonSources.some(p => typeof p !== 'string' || !p))) throw new Error('pythonSources must be a nonempty array of paths relative to each Python project');
  if (data.pythonTestDir != null && (typeof data.pythonTestDir !== 'string' || !data.pythonTestDir)) throw new Error('pythonTestDir must be a nonempty path');
  return data;
}
export function discover(root, options = {}) {
  root = realpathSync(resolve(root));
  const settings = loadSettings(root);
  const excludes = [...(settings.unitExcludes ?? []), ...(options.exclude ?? [])].map(p => unix(relative(root, inside(root, p))));
  if (excludes.includes('')) throw new Error('Cannot exclude the entire target');
  const language = options.language ?? 'auto';
  if (!['auto', 'go', 'java', 'python'].includes(language)) throw new Error('language must be auto, go, java or python');
  const files = walk(root, excludes);
  const projects = new Map();
  const add = (path, language) => projects.set(`${path}:${language}`, { path, language, dir: inside(root, path) });
  for (const file of files) {
    const name = file.split('/').at(-1), path = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.';
    if (name === 'go.mod') add(path, 'go');
    if (['pom.xml', 'build.gradle', 'build.gradle.kts'].includes(name)) add(path, 'java');
    if (['pyproject.toml', 'setup.py', 'setup.cfg', 'pytest.ini'].includes(name)) add(path, 'python');
  }
  if (![...projects.values()].some(p => p.language === 'python') && files.some(f => f.endsWith('.py'))) add('.', 'python');
  let selected = [...projects.values()].filter(p => language === 'auto' || p.language === language);
  if (options.module && options.module !== '.') {
    const target = inside(root, options.module);
    selected = selected.filter(p => p.dir === target);
  }
  if (!selected.length) throw new Error('No matching projects found; check --target-dir, --language, --module and exclusions');
  if (language === 'auto' && new Set(selected.map(p => p.language)).size > 1) throw new Error('Mixed-language repository: select --language go, java or python');
  for (const project of selected) {
    const nested = [...projects.values()].filter(p => p.dir !== project.dir && p.dir.startsWith(`${project.dir}${sep}`)).map(p => unix(relative(root, p.dir)));
    project.files = files.filter(f => (project.path === '.' || f.startsWith(`${project.path}/`)) && !nested.some(p => f.startsWith(`${p}/`)));
    project.localFiles = project.files.map(f => unix(relative(project.dir, inside(root, f))));
    project.excludes = [...excludes, ...nested].filter(p => inside(root, p).startsWith(`${project.dir}${sep}`)).map(p => unix(relative(project.dir, inside(root, p))));
  }
  return { root, projects: selected, settings };
}
export function isTest(file, language) {
  const name = file.split('/').at(-1);
  if (language === 'go') return file.endsWith('_test.go');
  if (language === 'java') return /(^|\/)src\/test\//.test(file);
  return name === 'conftest.py' || (file.endsWith('.py') && (/(^|\/)tests?\//.test(file) || /^test_.+\.py$/.test(name) || /_test\.py$/.test(name)));
}
