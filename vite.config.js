import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { timingSafeEqual } from 'node:crypto';

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_RATE_LIMIT_MAX = 60;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;

function parseList(raw) {
  return String(raw || '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(raw, fallback) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) {
    return fallback;
  }
  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }
  return fallback;
}

function parsePositiveInt(raw, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(raw || '').trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      const error = new Error(`Request body too large. Limit is ${maxBytes} bytes.`);
      error.code = 'BODY_TOO_LARGE';
      throw error;
    }
    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error('Invalid JSON body.');
  }
}

function normalizeIp(rawIp) {
  return String(rawIp || '')
    .trim()
    .replace(/^::ffff:/i, '');
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (forwarded.length > 0) {
    return normalizeIp(forwarded[0]);
  }

  return normalizeIp(req.socket?.remoteAddress || '');
}

function isLoopbackIp(rawIp) {
  const ip = normalizeIp(rawIp);
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function getHeaderValue(header) {
  if (Array.isArray(header)) {
    return String(header[0] || '').trim();
  }
  return String(header || '').trim();
}

function getProxyTokenFromRequest(req) {
  const directToken = getHeaderValue(req.headers['x-mini-ide-proxy-token']);
  if (directToken) {
    return directToken;
  }

  const authHeader = getHeaderValue(req.headers.authorization);
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return authHeader.slice(7).trim();
}

function secureEquals(left, right) {
  if (!left || !right) {
    return false;
  }

  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function authorizeGroqRequest(req, settings) {
  const requestIp = getClientIp(req);
  if (settings.localOnly && !isLoopbackIp(requestIp)) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Groq proxy is restricted to localhost. Set GROQ_PROXY_LOCAL_ONLY=false to override.'
    };
  }

  if (settings.allowedOrigins.length > 0) {
    const origin = getHeaderValue(req.headers.origin);
    if (!origin || !settings.allowedOrigins.includes(origin)) {
      return {
        ok: false,
        statusCode: 403,
        error: 'Origin is not allowed to access the Groq proxy.'
      };
    }
  }

  if (settings.authToken) {
    const providedToken = getProxyTokenFromRequest(req);
    if (!secureEquals(providedToken, settings.authToken)) {
      return {
        ok: false,
        statusCode: 401,
        error: 'Missing or invalid proxy token.'
      };
    }
  }

  return { ok: true, requestIp };
}

function createRateLimiter(limit, windowMs) {
  const counters = new Map();

  return (key) => {
    const now = Date.now();
    const id = key || 'unknown';
    const current = counters.get(id);

    if (!current || now - current.startedAt >= windowMs) {
      counters.set(id, { startedAt: now, count: 1 });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        retryAfterSeconds: 0
      };
    }

    current.count += 1;
    counters.set(id, current);

    if (counters.size > 2000) {
      for (const [counterKey, counterValue] of counters.entries()) {
        if (now - counterValue.startedAt >= windowMs) {
          counters.delete(counterKey);
        }
      }
    }

    const allowed = current.count <= limit;
    const retryAfterSeconds = allowed
      ? 0
      : Math.max(1, Math.ceil((windowMs - (now - current.startedAt)) / 1000));

    return {
      allowed,
      remaining: Math.max(0, limit - current.count),
      retryAfterSeconds
    };
  };
}

function createGroqProxy(env) {
  const groqApiKey = String(env.GROQ_API_KEY || '').trim();
  const groqBaseUrl = String(env.GROQ_ENDPOINT || 'https://api.groq.com/openai/v1')
    .trim()
    .replace(/\/+$/, '');
  const providedModels = parseList(env.GROQ_MODELS || env.VITE_GROQ_MODELS || env.VITE_ONLINE_MODELS);
  const authToken = String(env.GROQ_PROXY_TOKEN || '').trim();
  const localOnly = parseBoolean(env.GROQ_PROXY_LOCAL_ONLY, true);
  const allowedOrigins = parseList(env.GROQ_PROXY_ALLOWED_ORIGINS);
  const maxBodyBytes = parsePositiveInt(env.GROQ_PROXY_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES, 1024, 2 * 1024 * 1024);
  const rateLimitMax = parsePositiveInt(env.GROQ_PROXY_RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX, 1, 1000);
  const rateLimitWindowMs = parsePositiveInt(
    env.GROQ_PROXY_RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
    1000,
    10 * 60 * 1000
  );
  const consumeRateLimit = createRateLimiter(rateLimitMax, rateLimitWindowMs);

  return async function groqProxyMiddleware(req, res, next) {
    const url = new URL(req.url || '/', 'http://localhost');
    const { pathname } = url;

    const isGroqModelsRoute = pathname === '/api/ai/groq/models';
    const isGroqChatRoute = pathname === '/api/ai/groq/chat';
    const isGroqRoute = isGroqModelsRoute || isGroqChatRoute;

    if (!isGroqRoute) {
      next();
      return;
    }

    if ((isGroqModelsRoute && req.method !== 'GET') || (isGroqChatRoute && req.method !== 'POST')) {
      sendJson(res, 405, { error: 'Method not allowed.' });
      return;
    }

    const auth = authorizeGroqRequest(req, { localOnly, allowedOrigins, authToken });
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { error: auth.error });
      return;
    }

    const rate = consumeRateLimit(auth.requestIp);
    res.setHeader('X-RateLimit-Limit', String(rateLimitMax));
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    res.setHeader('X-RateLimit-Window-Ms', String(rateLimitWindowMs));

    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      sendJson(res, 429, { error: 'Rate limit exceeded for Groq proxy. Try again shortly.' });
      return;
    }

    if (isGroqModelsRoute) {
      if (providedModels.length > 0) {
        sendJson(res, 200, { models: providedModels, source: 'provided' });
        return;
      }

      if (!groqApiKey) {
        sendJson(res, 500, { error: 'Server missing GROQ_API_KEY.' });
        return;
      }

      try {
        const upstream = await fetch(`${groqBaseUrl}/models`, {
          headers: {
            Authorization: `Bearer ${groqApiKey}`
          }
        });

        const rawText = await upstream.text();
        if (!upstream.ok) {
          sendJson(res, upstream.status, { error: 'Groq models request failed.', details: rawText });
          return;
        }

        let payload;
        try {
          payload = JSON.parse(rawText);
        } catch {
          sendJson(res, 502, { error: 'Invalid response received from Groq models API.' });
          return;
        }

        const models = Array.isArray(payload.data)
          ? payload.data.map((item) => item?.id).filter(Boolean).sort((a, b) => a.localeCompare(b))
          : [];

        sendJson(res, 200, { models, source: 'api' });
      } catch (error) {
        sendJson(res, 502, { error: 'Failed to reach Groq models API.', details: error.message });
      }

      return;
    }

    if (isGroqChatRoute) {
      if (!groqApiKey) {
        sendJson(res, 500, { error: 'Server missing GROQ_API_KEY.' });
        return;
      }

      let body;
      try {
        body = await readJsonBody(req, maxBodyBytes);
      } catch (error) {
        const statusCode = error?.code === 'BODY_TOO_LARGE' ? 413 : 400;
        sendJson(res, statusCode, { error: error.message || 'Invalid request body.' });
        return;
      }

      const model = String(body.model || '').trim();
      const messages = Array.isArray(body.messages) ? body.messages : null;
      const stream = Boolean(body.stream);

      if (!model) {
        sendJson(res, 400, { error: 'Missing required field: model.' });
        return;
      }

      if (!messages) {
        sendJson(res, 400, { error: 'Missing required field: messages.' });
        return;
      }

      try {
        const upstream = await fetch(`${groqBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqApiKey}`
          },
          body: JSON.stringify({ model, messages, stream })
        });

        if (!upstream.ok) {
          const rawText = await upstream.text().catch(() => '');
          sendJson(res, upstream.status, { error: 'Groq chat request failed.', details: rawText });
          return;
        }

        if (!stream) {
          const rawText = await upstream.text().catch(() => '');
          if (!rawText) {
            sendJson(res, 502, { error: 'Empty response from Groq chat API.' });
            return;
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(rawText);
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');

        if (!upstream.body) {
          res.end();
          return;
        }

        const reader = upstream.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          res.write(Buffer.from(value));
        }

        res.end();
      } catch (error) {
        sendJson(res, 502, { error: 'Failed to reach Groq chat API.', details: error.message });
      }

      return;
    }
  };
}

function groqProxyPlugin(env) {
  const middleware = createGroqProxy(env);

  return {
    name: 'groq-server-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), groqProxyPlugin(env)]
  };
});
