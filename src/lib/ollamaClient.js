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

const GROQ_PROXY_TOKEN = String(import.meta.env.VITE_GROQ_PROXY_TOKEN || '').trim();
const GROQ_BASE_URL = normalizeEndpoint(
  import.meta.env.VITE_GROQ_ENDPOINT || 'https://api.groq.com/openai/v1'
);

function normalizeApiKey(value) {
  return String(value || '').trim();
}

function shouldUseDirectGroq(apiKey) {
  return Boolean(normalizeApiKey(apiKey));
}

function isGroqProxyUrl(url) {
  return String(url || '').startsWith('/api/ai/groq/');
}

function withGroqProxyHeaders(headers = {}) {
  if (!GROQ_PROXY_TOKEN) {
    return headers;
  }

  return {
    ...headers,
    'x-mini-ide-proxy-token': GROQ_PROXY_TOKEN
  };
}

function withGroqAuthHeaders(headers = {}, apiKey = '') {
  const normalizedApiKey = normalizeApiKey(apiKey);

  if (normalizedApiKey) {
    return {
      ...headers,
      Authorization: `Bearer ${normalizedApiKey}`
    };
  }

  return withGroqProxyHeaders(headers);
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

async function toFriendlyHttpError(response, provider) {
  const bodyText = await response.text().catch(() => '');

  if (provider === 'groq') {
    if (response.status === 401) {
      return createFriendlyError('Groq authentication failed. Check your Groq API key.', bodyText);
    }

    if (response.status === 403) {
      return createFriendlyError('Groq request was blocked (origin/client policy).', bodyText);
    }

    if (response.status === 404) {
      return createFriendlyError('Groq endpoint not found. Check VITE_GROQ_ENDPOINT or proxy routes.', bodyText);
    }

    if (response.status === 429) {
      return createFriendlyError('Groq rate limit reached. Try again shortly.', bodyText);
    }

    if (response.status === 413) {
      return createFriendlyError('Groq rejected an oversized request. Reduce prompt/context size.', bodyText);
    }

    if (response.status >= 500) {
      return createFriendlyError('Groq request failed on the server side.', bodyText);
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
      throw createFriendlyError(
        isGroqProxyUrl(url) ? 'Could not reach the Groq proxy on this server.' : 'Could not reach the Groq API endpoint.',
        error.message
      );
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
  const data = await fetchJson(
    '/api/ai/groq/models',
    {
      headers: withGroqProxyHeaders()
    },
    'groq'
  );
  return Array.isArray(data.models) ? data.models.filter(Boolean) : [];
}

async function listGroqModelsDirect(apiKey) {
  if (!GROQ_BASE_URL) {
    throw createFriendlyError('Groq endpoint is empty. Set VITE_GROQ_ENDPOINT.');
  }

  const data = await fetchJson(
    `${GROQ_BASE_URL}/models`,
    {
      headers: withGroqAuthHeaders({}, apiKey)
    },
    'groq'
  );

  return Array.isArray(data.data)
    ? data.data
        .map((model) => model?.id)
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
    : [];
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
    if (isAbortError(error)) {
      throw error;
    }

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

async function chatWithGroq(model, messages, apiKey = '', options = {}) {
  const { stream = true, onToken, signal } = options;
  const useDirectRequest = shouldUseDirectGroq(apiKey);

  if (!model) {
    throw createFriendlyError('Select a Groq model before asking.');
  }

  if (useDirectRequest && !GROQ_BASE_URL) {
    throw createFriendlyError('Groq endpoint is empty. Set VITE_GROQ_ENDPOINT.');
  }

  let response;

  try {
    response = await fetch(useDirectRequest ? `${GROQ_BASE_URL}/chat/completions` : '/api/ai/groq/chat', {
      method: 'POST',
      headers: withGroqAuthHeaders(
        {
          'Content-Type': 'application/json'
        },
        apiKey
      ),
      body: JSON.stringify({
        model,
        messages,
        stream
      }),
      signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw createFriendlyError(
      useDirectRequest ? 'Could not connect to Groq API.' : 'Could not connect to the Groq proxy.',
      error.message
    );
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

export async function listModels(provider, endpoint, apiKey = '') {
  const resolvedProvider = requireProvider(provider);

  if (resolvedProvider === 'groq') {
    if (shouldUseDirectGroq(apiKey)) {
      return listGroqModelsDirect(apiKey);
    }

    return listGroqModels();
  }

  return listOllamaModels(endpoint);
}

export async function testConnection(provider, endpoint, apiKey = '') {
  try {
    const models = await listModels(provider, endpoint, apiKey);
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

export async function chat(provider, endpoint, apiKey, model, messages, options = {}) {
  const resolvedProvider = requireProvider(provider);

  if (resolvedProvider === 'groq') {
    return chatWithGroq(model, messages, apiKey, options);
  }

  return chatWithOllama(endpoint, model, messages, options);
}
