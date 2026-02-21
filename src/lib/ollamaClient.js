function normalizeEndpoint(endpoint) {
  return String(endpoint || '')
    .trim()
    .replace(/\/+$/, '');
}

function createFriendlyError(message, details = '') {
  const error = new Error(message);
  error.details = details;
  return error;
}

async function toFriendlyHttpError(response, provider) {
  const bodyText = await response.text().catch(() => '');

  if (provider === 'groq') {
    if (response.status === 401) {
      return createFriendlyError('Groq authentication failed on the server.', bodyText);
    }

    if (response.status === 404) {
      return createFriendlyError('Groq proxy route not found. Restart the dev server.', bodyText);
    }

    if (response.status === 429) {
      return createFriendlyError('Groq rate limit reached. Try again shortly.', bodyText);
    }

    if (response.status >= 500) {
      return createFriendlyError('Server-side Groq proxy error. Check GROQ_API_KEY in .env.', bodyText);
    }

    return createFriendlyError(`Groq request failed (${response.status}).`, bodyText);
  }

  if (response.status === 404) {
    return createFriendlyError('Ollama API path not found. Check the endpoint URL.', bodyText);
  }

  if (response.status === 403) {
    return createFriendlyError('Request blocked. Check Ollama CORS and host settings.', bodyText);
  }

  if (response.status >= 500) {
    return createFriendlyError('Ollama returned a server error.', bodyText);
  }

  return createFriendlyError(`Ollama request failed (${response.status}).`, bodyText);
}

async function fetchJson(url, options = {}, provider = 'ollama') {
  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    if (provider === 'groq') {
      throw createFriendlyError('Could not reach the Groq proxy on this server.', error.message);
    }

    throw createFriendlyError(
      'Could not connect to Ollama. Ensure it is running and CORS allows this origin.',
      error.message
    );
  }

  if (!response.ok) {
    throw await toFriendlyHttpError(response, provider);
  }

  return response.json();
}

function requireProvider(provider) {
  if (provider === 'groq' || provider === 'ollama') {
    return provider;
  }

  throw createFriendlyError(`Unsupported provider: ${provider}`);
}

async function listOllamaModels(endpoint) {
  const baseUrl = normalizeEndpoint(endpoint);

  if (!baseUrl) {
    throw createFriendlyError('Ollama endpoint is empty.');
  }

  const data = await fetchJson(`${baseUrl}/api/tags`, {}, 'ollama');
  return Array.isArray(data.models)
    ? data.models.map((model) => model.name).filter(Boolean)
    : [];
}

async function listGroqModels() {
  const data = await fetchJson('/api/ai/groq/models', {}, 'groq');
  return Array.isArray(data.models) ? data.models.filter(Boolean) : [];
}

function parseOllamaJsonlChunk(rawChunk, onToken, aggregatedRef) {
  const line = rawChunk.trim();
  if (!line) {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(line);
  } catch {
    return;
  }

  if (payload.error) {
    throw createFriendlyError(payload.error);
  }

  const token = payload?.message?.content || '';
  if (token) {
    aggregatedRef.value += token;
    if (onToken) {
      onToken(token, aggregatedRef.value);
    }
  }
}

function parseGroqSseChunk(rawChunk, onToken, aggregatedRef) {
  const line = rawChunk.trim();
  if (!line || !line.startsWith('data:')) {
    return;
  }

  const payloadText = line.slice(5).trim();
  if (!payloadText || payloadText === '[DONE]') {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return;
  }

  if (payload.error?.message) {
    throw createFriendlyError(payload.error.message);
  }

  const token = payload?.choices?.[0]?.delta?.content || '';
  if (token) {
    aggregatedRef.value += token;
    if (onToken) {
      onToken(token, aggregatedRef.value);
    }
  }
}

async function readStreamingResponse(response, parser, onToken) {
  if (!response.body) {
    throw createFriendlyError('Streaming not supported by this browser/response.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const aggregatedRef = { value: '' };
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      parser(rawLine, onToken, aggregatedRef);
    }
  }

  if (buffer.trim()) {
    parser(buffer, onToken, aggregatedRef);
  }

  return aggregatedRef.value;
}

async function chatWithOllama(endpoint, model, messages, options = {}) {
  const baseUrl = normalizeEndpoint(endpoint);
  const { stream = true, onToken, signal } = options;

  if (!baseUrl) {
    throw createFriendlyError('Ollama endpoint is empty.');
  }

  if (!model) {
    throw createFriendlyError('Select an Ollama model before asking.');
  }

  let response;

  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        stream
      }),
      signal
    });
  } catch (error) {
    throw createFriendlyError(
      'Could not connect to Ollama chat API. Verify endpoint and CORS settings.',
      error.message
    );
  }

  if (!response.ok) {
    throw await toFriendlyHttpError(response, 'ollama');
  }

  if (!stream) {
    const data = await response.json();
    return data?.message?.content || '';
  }

  return readStreamingResponse(response, parseOllamaJsonlChunk, onToken);
}

async function chatWithGroq(model, messages, options = {}) {
  const { stream = true, onToken, signal } = options;

  if (!model) {
    throw createFriendlyError('Select a Groq model before asking.');
  }

  let response;

  try {
    response = await fetch('/api/ai/groq/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        stream
      }),
      signal
    });
  } catch (error) {
    throw createFriendlyError('Could not connect to the Groq proxy.', error.message);
  }

  if (!response.ok) {
    throw await toFriendlyHttpError(response, 'groq');
  }

  if (!stream) {
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || '';
  }

  return readStreamingResponse(response, parseGroqSseChunk, onToken);
}

export async function listModels(provider, endpoint) {
  const resolvedProvider = requireProvider(provider);

  if (resolvedProvider === 'groq') {
    return listGroqModels();
  }

  return listOllamaModels(endpoint);
}

export async function testConnection(provider, endpoint) {
  try {
    const models = await listModels(provider, endpoint);
    return {
      ok: true,
      models,
      error: ''
    };
  } catch (error) {
    return {
      ok: false,
      models: [],
      error: error.message
    };
  }
}

export async function chat(provider, endpoint, _apiKey, model, messages, options = {}) {
  const resolvedProvider = requireProvider(provider);

  if (resolvedProvider === 'groq') {
    return chatWithGroq(model, messages, options);
  }

  return chatWithOllama(endpoint, model, messages, options);
}
