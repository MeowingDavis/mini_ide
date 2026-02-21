import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function parseProvidedModels(raw) {
  return String(raw || '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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

function createGroqProxy(env) {
  const groqApiKey = String(env.GROQ_API_KEY || '').trim();
  const groqBaseUrl = String(env.GROQ_ENDPOINT || 'https://api.groq.com/openai/v1')
    .trim()
    .replace(/\/+$/, '');
  const providedModels = parseProvidedModels(env.GROQ_MODELS || env.VITE_GROQ_MODELS || env.VITE_ONLINE_MODELS);

  return async function groqProxyMiddleware(req, res, next) {
    const url = new URL(req.url || '/', 'http://localhost');
    const { pathname } = url;

    if (pathname === '/api/ai/groq/models' && req.method === 'GET') {
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

    if (pathname === '/api/ai/groq/chat' && req.method === 'POST') {
      if (!groqApiKey) {
        sendJson(res, 500, { error: 'Server missing GROQ_API_KEY.' });
        return;
      }

      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        sendJson(res, 400, { error: error.message || 'Invalid request body.' });
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

    next();
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
