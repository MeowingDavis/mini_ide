function escapeClosingScriptTag(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

function isHtmlDocument(source) {
  const trimmed = String(source || '').trimStart();
  return /<!doctype\s+html/i.test(trimmed) || /<html[\s>]/i.test(trimmed);
}

function stripStylesheetLinkTag(source) {
  return source.replace(
    /<link\b[^>]*href\s*=\s*["']styles\.css["'][^>]*>/gi,
    ''
  );
}

function stripMainScriptTag(source) {
  return source.replace(
    /<script\b[^>]*src\s*=\s*["']main\.js["'][^>]*>\s*<\/script>/gi,
    ''
  );
}

function isLocalPath(value) {
  const path = String(value || '').trim();
  if (!path) return false;
  if (path.startsWith('#')) return false;
  if (/^(https?:|data:|blob:|mailto:|tel:)/i.test(path)) return false;
  if (path.startsWith('//')) return false;
  return true;
}

function normalizeProjectPath(value) {
  return String(value || '')
    .trim()
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function inlineLinkedProjectAssets(source, files) {
  const inlinedCss = new Set();
  const inlinedJs = new Set();
  let next = source;

  next = next.replace(/<link\b([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*?)>/gi, (match, before, href, after) => {
    const normalizedPath = normalizeProjectPath(href);
    if (!isLocalPath(href) || !normalizedPath.toLowerCase().endsWith('.css')) {
      return match;
    }

    if (!Object.prototype.hasOwnProperty.call(files, normalizedPath)) {
      return match;
    }

    inlinedCss.add(normalizedPath);
    return `<style data-inline-file="${normalizedPath}">${files[normalizedPath] || ''}</style>`;
  });

  next = next.replace(
    /<script\b([^>]*?)src\s*=\s*["']([^"']+)["']([^>]*?)>\s*<\/script>/gi,
    (match, before, src, after) => {
      const normalizedPath = normalizeProjectPath(src);
      if (!isLocalPath(src) || !/\.(js|mjs|cjs)$/i.test(normalizedPath)) {
        return match;
      }

      if (!Object.prototype.hasOwnProperty.call(files, normalizedPath)) {
        return match;
      }

      inlinedJs.add(normalizedPath);
      return `<script data-inline-file="${normalizedPath}">${escapeClosingScriptTag(files[normalizedPath] || '')}</script>`;
    }
  );

  return { html: next, inlinedCss, inlinedJs };
}

function injectIntoHead(source, content) {
  if (/<\/head>/i.test(source)) {
    return source.replace(/<\/head>/i, `${content}\n</head>`);
  }

  if (/<html[\s>]/i.test(source)) {
    return source.replace(/<html([^>]*)>/i, `<html$1>\n<head>\n${content}\n</head>`);
  }

  return `<head>\n${content}\n</head>\n${source}`;
}

function injectIntoBody(source, content) {
  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, `${content}\n</body>`);
  }

  return `${source}\n${content}`;
}

function createBridgeScript() {
  return `(() => {
    const post = (type, payload = {}) => {
      const message = { source: 'mini-ide-preview', type, ...payload };

      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(message, '*');
        } else if (window.parent && window.parent !== window) {
          window.parent.postMessage(message, '*');
        }
      } catch {
        // Ignore cross-window messaging errors.
      }
    };

    const serialize = (value) => {
      if (typeof value === 'string') return value;
      if (value instanceof Error) return value.stack || value.message;

      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };

    ['log', 'info', 'warn', 'error'].forEach((level) => {
      const original = console[level].bind(console);
      console[level] = (...args) => {
        post('console', { level, args: args.map(serialize) });
        original(...args);
      };
    });

    window.addEventListener('error', (event) => {
      post('error', {
        message: event.message || 'Runtime error',
        stack: event.error?.stack || ''
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const message = reason?.message || serialize(reason);
      const stack = reason?.stack || '';
      post('error', {
        message: 'Unhandled Promise Rejection: ' + message,
        stack
      });
    });
  })();`;
}

export function buildSrcDoc(files) {
  const html = files['index.html'] || '';
  const bridge = escapeClosingScriptTag(createBridgeScript());
  const fallbackCss = files['styles.css'] || '';
  const fallbackJs = files['main.js'] || '';

  if (isHtmlDocument(html)) {
    let doc = html;
    let inlinedCss = new Set();
    let inlinedJs = new Set();

    const inlineResult = inlineLinkedProjectAssets(doc, files);
    doc = inlineResult.html;
    inlinedCss = inlineResult.inlinedCss;
    inlinedJs = inlineResult.inlinedJs;

    if (!inlinedCss.has('styles.css')) {
      doc = stripStylesheetLinkTag(doc);
    }
    if (!inlinedJs.has('main.js')) {
      doc = stripMainScriptTag(doc);
    }

    if (fallbackCss && !inlinedCss.has('styles.css')) {
      doc = injectIntoHead(doc, `<style>${fallbackCss}</style>`);
    }

    const scriptParts = [`<script>${bridge}</script>`];
    if (fallbackJs && !inlinedJs.has('main.js')) {
      scriptParts.push(`<script>${escapeClosingScriptTag(fallbackJs)}</script>`);
    }
    doc = injectIntoBody(doc, scriptParts.join('\n'));

    return doc;
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${fallbackCss}</style>
  </head>
  <body>
    ${html}
    <script>${bridge}</script>
    <script>${escapeClosingScriptTag(fallbackJs)}</script>
  </body>
</html>`;
}
