// Optional transports. Only an explicit --provider sends source context over HTTP.
export async function generate(prompt, options, env = process.env) {
  const provider = options.provider;
  if (!['ollama', 'openai-compatible'].includes(provider)) throw new Error('provider must be ollama or openai-compatible');
  if (!options.model) throw new Error('--model is required; use an installed model name or your API deployment name');
  if (provider === 'openai-compatible' && !options['base-url']) throw new Error('--base-url is required for openai-compatible providers');
  const base = new URL(options['base-url'] ?? 'http://127.0.0.1:11434');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Use an HTTP(S) base URL without credentials, query or fragment');
  const keyName = options['api-key-env'] ?? 'TESTGEN_API_KEY';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyName)) throw new Error('api-key-env must be an environment variable name');
  const key = env[keyName];
  if (key && base.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Use HTTPS when sending credentials to a remote endpoint');
  const maxTokens = Number(options['max-tokens'] ?? 4096);
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) throw new Error('max-tokens must be a positive integer');
  const path = provider === 'ollama' ? 'api/generate' : 'chat/completions';
  base.pathname = `${base.pathname.replace(/\/$/, '')}/${path}`;
  const payload = provider === 'ollama'
    ? { model: options.model, prompt, stream: false, options: { temperature: 0, num_predict: maxTokens } }
    : { model: options.model, messages: [{ role: 'user', content: prompt }], stream: false, max_tokens: maxTokens };
  let response;
  try {
    response = await fetch(base, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(Number(options.timeout ?? 120000)),
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(`Model request failed (${error.name}). Check server reachability and --timeout.`);
  }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Model endpoint returned HTTP ${response.status}; check its model, authentication and server logs.`); }
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4 * 1024 * 1024) { await reader.cancel(); throw new Error('Model response exceeds 4 MiB'); }
    chunks.push(Buffer.from(value));
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Model endpoint did not return a JSON response'); }
  const text = provider === 'ollama' ? data.response : data.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Model endpoint returned no generated text');
  return { status: 'pass', provider, model: options.model, suggestion: text, warning: 'Model output is unvalidated. Review and apply test changes, then run validation, coverage and review.' };
}
