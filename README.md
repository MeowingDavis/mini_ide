# Mini IDE

## What This App Is

Mini IDE is a browser-based coding workspace for building small web projects with multiple files.  
It combines:

- a file explorer + Monaco code editor
- a live HTML/CSS/JS preview
- an in-app console
- an AI chat assistant that can suggest code and inject snippets directly into your active file

The goal is fast iteration in one screen: edit files, run preview, inspect output/errors, and ask AI for fixes.

## Core Capabilities

- Multi-file project editing (`index.html`, `main.js`, `styles.css`, plus any extra files/folders)
- File operations: create, rename, move, delete files and folders
- Live preview with auto-run or manual run
- Detached preview window support
- Resizable workspace panels (editor, preview, console, AI chat)
- AI provider support with `Ollama` (local) and `Groq` (server proxy)
- AI inline code injection into the current editor file

## Run

```bash
npm install
npm run dev
```

## Build Preview

```bash
npm run build
npm run preview
```

## AI/API Notes

- Ollama calls go directly to your configured Ollama endpoint.
- Groq calls are routed through Vite middleware (`/api/ai/groq/*`) so API keys stay on the server side.
- Optionally set `VITE_GROQ_PROXY_TOKEN` in the frontend and `GROQ_PROXY_TOKEN` on the server to require token auth.

## Groq Proxy Security

The Vite Groq proxy is local-only by default and now supports request hardening controls:

- `GROQ_PROXY_LOCAL_ONLY` (`true` by default) limits access to loopback clients.
- `GROQ_PROXY_ALLOWED_ORIGINS` (comma-separated) restricts allowed browser origins.
- `GROQ_PROXY_TOKEN` enables token auth for `/api/ai/groq/*` requests.
- `VITE_GROQ_PROXY_TOKEN` sends the token from the browser client.
- `GROQ_PROXY_MAX_BODY_BYTES` caps JSON request body size (default `262144`).
- `GROQ_PROXY_RATE_LIMIT_MAX` and `GROQ_PROXY_RATE_LIMIT_WINDOW_MS` set per-IP rate limits.
