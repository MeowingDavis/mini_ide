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
- AI provider support with `Ollama` (local) and `Groq` (direct API key or local proxy fallback)
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

## Local-Only AI Setup

This app is intended to run locally (`npm run dev` / `npm run preview`).

### Ollama

- In `Leaf chat -> Settings`, choose `Ollama`.
- Set your endpoint (default: `http://localhost:11434`).
- Use `Test connection` to verify and load local models.

### Groq (User-Provided API Key)

- In `Leaf chat -> Settings`, choose `Groq`.
- Paste your Groq API key (`gsk_...`) in the `Groq API Key` field.
- Click `Test connection` to load models from Groq.
- By default, the key is stored in `sessionStorage` (cleared when the browser session ends).
- Enable `Remember on this device` to store it in `localStorage`.
- Use `Clear key` to remove it from both session and local storage.

### Key Handling Notes

- Keys are not sent to your own backend by default when direct Groq mode is used.
- Keys are never written to git if you keep using the in-app settings flow.
- `.env` files are already ignored by git in this repo.

## Optional Groq Proxy Mode (Fallback)

If no Groq key is entered in settings, the app falls back to the local Vite proxy routes (`/api/ai/groq/*`), which can use a server-side `GROQ_API_KEY`.

## Groq Proxy Security

The Vite Groq proxy is local-only by default and now supports request hardening controls:

- `GROQ_PROXY_LOCAL_ONLY` (`true` by default) limits access to loopback clients.
- `GROQ_PROXY_ALLOWED_ORIGINS` (comma-separated) restricts allowed browser origins.
- `GROQ_PROXY_TOKEN` enables token auth for `/api/ai/groq/*` requests.
- `VITE_GROQ_PROXY_TOKEN` sends the token from the browser client.
- `GROQ_PROXY_MAX_BODY_BYTES` caps JSON request body size (default `262144`).
- `GROQ_PROXY_RATE_LIMIT_MAX` and `GROQ_PROXY_RATE_LIMIT_WINDOW_MS` set per-IP rate limits.

## Environment Variables

- `VITE_AI_PROVIDER`: optional default provider (`ollama` or `groq`)
- `VITE_OLLAMA_ENDPOINT`: optional default Ollama endpoint
- `VITE_GROQ_ENDPOINT`: optional Groq API base URL (default: `https://api.groq.com/openai/v1`)
- `VITE_GROQ_MODELS` / `VITE_ONLINE_MODELS`: optional comma/newline-separated model list
