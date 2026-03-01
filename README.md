# Mini IDE

## Run

```bash
npm install
npm run dev
```

## Groq Proxy Security

The Vite Groq proxy is local-only by default and now supports request hardening controls:

- `GROQ_PROXY_LOCAL_ONLY` (`true` by default) limits access to loopback clients.
- `GROQ_PROXY_ALLOWED_ORIGINS` (comma-separated) restricts allowed browser origins.
- `GROQ_PROXY_TOKEN` enables token auth for `/api/ai/groq/*` requests.
- `VITE_GROQ_PROXY_TOKEN` sends the token from the browser client.
- `GROQ_PROXY_MAX_BODY_BYTES` caps JSON request body size (default `262144`).
- `GROQ_PROXY_RATE_LIMIT_MAX` and `GROQ_PROXY_RATE_LIMIT_WINDOW_MS` set per-IP rate limits.
