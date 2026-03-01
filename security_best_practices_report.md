# Security Best Practices Report

## Executive Summary
This JavaScript/React frontend has a strong baseline in some areas (notably a sandboxed in-app preview iframe and no obvious `innerHTML`/`dangerouslySetInnerHTML` sinks), but there are **two high-impact trust-boundary issues** that should be addressed first:

1. **Critical:** the detached preview popout executes untrusted project code in an unsandboxed, same-origin window.
2. **High:** the Groq server proxy is unauthenticated and can be used as an API-key relay if exposed beyond local development.

I also found medium-risk issues around `postMessage` origin handling and sensitive-data persistence in `localStorage`.

## Scope, Evidence, and Limitations
- Reviewed: React frontend + Vite proxy middleware.
- Evidence includes file and line references.
- `npm audit` could not run due network resolution failure in this environment, so dependency CVE status is **not verified**.

---

## Critical Findings

### [SBP-001] Unsandboxed detached preview allows same-origin code execution
- Severity: **Critical**
- Location:
  - `/home/mojo-bananas/Documents/GitHub/mini_ide/src/app/App.jsx:154`
  - `/home/mojo-bananas/Documents/GitHub/mini_ide/src/app/App.jsx:155`
  - `/home/mojo-bananas/Documents/GitHub/mini_ide/src/app/App.jsx:244`
  - Contrast (safer in-app preview): `/home/mojo-bananas/Documents/GitHub/mini_ide/src/components/PreviewFrame.jsx:7`
- Evidence:
  - Detached preview writes project-generated HTML directly into a popup document via `document.write(nextSrcDoc)`.
  - Popup is opened with `window.open('', ..., 'popup=yes,...')` and no sandbox isolation.
- One-sentence impact: **Any untrusted preview code can run with app origin privileges and potentially access/modify app state, storage, and opener window.**
- Why this matters:
  - Project code and AI-suggested code are execution inputs and may include malicious scripts.
  - In-app iframe preview is sandboxed (`sandbox="allow-scripts"`), but detached mode bypasses that containment.
- Recommended fix:
  1. Replace detached direct `document.write` execution with a detached shell that renders content inside a sandboxed iframe (`allow-scripts` only, no `allow-same-origin`).
  2. Avoid same-origin execution of raw preview code in top-level windows.
  3. Consider disabling detached mode until sandbox parity is implemented.

---

## High Findings

### [SBP-002] Groq proxy is an unauthenticated API-key relay
- Severity: **High**
- Location:
  - `/home/mojo-bananas/Documents/GitHub/mini_ide/vite.config.js:91`
  - `/home/mojo-bananas/Documents/GitHub/mini_ide/vite.config.js:120`
  - `/home/mojo-bananas/Documents/GitHub/mini_ide/vite.config.js:189`
- Evidence:
  - `/api/ai/groq/chat` accepts arbitrary `model/messages` and forwards using server `GROQ_API_KEY`.
  - Middleware is attached in both dev and preview server flows (`configureServer` and `configurePreviewServer`).
  - No auth, no origin allowlist, no rate limiting.
- Impact:
  - If reachable from untrusted users, endpoint can be abused for unauthorized model usage/costs and potential service degradation.
- Recommended fix:
  1. Require authentication for proxy routes.
  2. Add per-user/IP rate limits and request quotas.
  3. Restrict deployment to trusted local/dev contexts if this proxy is intentionally dev-only.
  4. Consider server-side allowlist for accepted models and max prompt/token sizes.

### [SBP-003] `postMessage` uses wildcard target origin and receiver lacks origin validation
- Severity: **High**
- Location:
  - Sender: `/home/mojo-bananas/Documents/GitHub/mini_ide/src/lib/buildSrcDoc.js:253`, `:255`
  - Receiver: `/home/mojo-bananas/Documents/GitHub/mini_ide/src/app/App.jsx:203`
- Evidence:
  - Sender posts with `postMessage(message, '*')`.
  - Receiver checks `event.source` object but does not validate `event.origin`.
- Impact:
  - Cross-window message trust is broader than necessary and easier to misuse as architecture evolves (especially with popup navigation/origin shifts).
- Recommended fix:
  1. Use explicit `targetOrigin` whenever possible.
  2. Validate both `event.source` and `event.origin` in listener.
  3. Add a per-session random channel token in message payload to bind sender/receiver more tightly.

---

## Medium Findings

### [SBP-004] Project files and uploaded docs are persisted in plaintext localStorage
- Severity: **Medium**
- Location:
  - localStorage wrapper: `/home/mojo-bananas/Documents/GitHub/mini_ide/src/hooks/useLocalStorageState.js:10`, `:23`
  - project files persisted: `/home/mojo-bananas/Documents/GitHub/mini_ide/src/hooks/useProjectStore.js:13`
  - uploaded docs persisted: `/home/mojo-bananas/Documents/GitHub/mini_ide/src/hooks/useUploadedDocs.js:14`, `:23`
- Evidence:
  - State is JSON-serialized to `window.localStorage` with no classification/expiry.
- Impact:
  - Sensitive snippets/docs may persist longer than users expect and are exposed to any same-origin script execution (including XSS).
- Recommended fix:
  1. Make persistence of uploaded docs opt-in (default off).
  2. Add “sensitive mode” to keep state memory-only and auto-clear on tab close.
  3. Add TTL + explicit secure wipe controls for stored docs/project snapshots.

### [SBP-005] Request body parser has no size limits (potential memory DoS)
- Severity: **Medium**
- Location:
  - `/home/mojo-bananas/Documents/GitHub/mini_ide/vite.config.js:17-24`
- Evidence:
  - `readJsonBody` buffers entire request body without max size checks.
- Impact:
  - Large request payloads can consume memory and degrade/terminate the proxy process if endpoint is exposed.
- Recommended fix:
  1. Enforce max body size (e.g., 1-2 MB) and early reject oversized requests.
  2. Combine with rate limiting and auth for proxy routes.

---

## Low / Informational Findings

### [SBP-006] No explicit CSP/security-header policy visible in repo
- Severity: **Low / Informational**
- Location:
  - `/home/mojo-bananas/Documents/GitHub/mini_ide/index.html`
- Evidence:
  - No CSP/security header config is visible in app code; this may be configured externally.
- Impact:
  - Missing defense-in-depth if not configured at edge/server runtime.
- Recommended fix:
  1. Verify runtime headers at deployment edge/server (CSP, `X-Content-Type-Options`, clickjacking controls, `Referrer-Policy`).
  2. Add documentation in repo for expected production security headers.

---

## Positive Observations
- In-app preview iframe is sandboxed: `/home/mojo-bananas/Documents/GitHub/mini_ide/src/components/PreviewFrame.jsx:7`.
- No obvious dangerous DOM insertion patterns (`innerHTML`, `dangerouslySetInnerHTML`, `eval`) were found in current React component code.

## Dependency Audit Status
- `npm audit --omit=dev` failed due network resolution error (`EAI_AGAIN`), so dependency advisories are not included in this report.
