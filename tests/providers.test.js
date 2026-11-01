import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generate } from '../lib/providers.js';

async function server(t, handle) {
  const instance = createServer(handle);
  await new Promise((resolve, reject) => { instance.once('error', reject); instance.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { instance.close(resolve); instance.closeAllConnections(); }));
  return `http://127.0.0.1:${instance.address().port}`;
}
async function body(request) { const data = []; for await (const chunk of request) data.push(chunk); return JSON.parse(Buffer.concat(data)); }

test('Ollama sends scoped context with streaming disabled', async t => {
  const base = await server(t, async (request, response) => {
    assert.equal(request.url, '/api/generate'); assert.equal(request.headers.authorization, undefined);
    const payload = await body(request);
    assert.equal(payload.model, 'my-installed-model'); assert.equal(payload.prompt, 'test context'); assert.equal(payload.stream, false);
    response.end(JSON.stringify({ response: 'suggested test code' }));
  });
  const result = await generate('test context', { provider: 'ollama', model: 'my-installed-model', 'base-url': base }, {});
  assert.equal(result.suggestion, 'suggested test code'); assert.match(result.warning, /unvalidated/);
});

test('compatible API uses environment credentials without returning them', async t => {
  const base = await server(t, async (request, response) => {
    assert.equal(request.url, '/v1/chat/completions'); assert.equal(request.headers.authorization, 'Bearer fixture-token');
    assert.equal((await body(request)).messages[0].content, 'source context');
    response.end(JSON.stringify({ choices: [{ message: { content: 'new test' } }] }));
  });
  const result = await generate('source context', { provider: 'openai-compatible', model: 'deployment', 'base-url': `${base}/v1` }, { TESTGEN_API_KEY: 'fixture-token' });
  assert.equal(result.suggestion, 'new test'); assert.ok(!JSON.stringify(result).includes('fixture-token'));
});

test('invalid model configuration fails before sending source', async () => {
  await assert.rejects(generate('source', { provider: 'unknown', model: 'test' }), /provider/);
  await assert.rejects(generate('source', { provider: 'ollama' }), /model/);
  await assert.rejects(generate('source', { provider: 'openai-compatible', model: 'test' }), /base-url/);
  await assert.rejects(generate('source', { provider: 'ollama', model: 'test', 'base-url': 'https://user:pass@example.invalid' }), /without credentials/);
  await assert.rejects(generate('source', { provider: 'ollama', model: 'test', 'base-url': 'http://remote.example.invalid' }, { TESTGEN_API_KEY: 'fixture-token' }), /HTTPS/);
  await assert.rejects(generate('source', { provider: 'ollama', model: 'test', 'max-tokens': '-1' }), /max-tokens/);
});

test('HTTP errors hide potentially sensitive response bodies', async t => {
  const base = await server(t, (request, response) => { response.statusCode = 401; response.end('fixture-secret echoed by upstream'); });
  await assert.rejects(generate('source', { provider: 'ollama', model: 'test', 'base-url': base }), error => /HTTP 401/.test(error.message) && !error.message.includes('fixture-secret'));
});

test('malformed and empty output fail rather than claiming generated tests', async t => {
  const malformed = await server(t, (request, response) => response.end('not JSON'));
  await assert.rejects(generate('source', { provider: 'ollama', model: 'test', 'base-url': malformed }), /JSON/);
  const empty = await server(t, (request, response) => response.end('{}'));
  await assert.rejects(generate('source', { provider: 'ollama', model: 'test', 'base-url': empty }), /no generated text/);
});

test('redirects are refused rather than forwarding credentials', async t => {
  const base = await server(t, (request, response) => { response.statusCode = 302; response.setHeader('Location', 'https://example.invalid'); response.end(); });
  await assert.rejects(generate('source', { provider: 'ollama', model: 'test', 'base-url': base }, { TESTGEN_API_KEY: 'fixture-token' }), /Model request failed/);
});
