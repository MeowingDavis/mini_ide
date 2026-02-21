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
      parent.postMessage({ source: 'mini-ide-preview', type, ...payload }, '*');
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
  const css = files['styles.css'] || '';
  const js = files['main.js'] || '';
  const bridge = escapeClosingScriptTag(createBridgeScript());
  const scriptBlock = `<script>${bridge}</script>\n<script>${escapeClosingScriptTag(js)}</script>`;

  if (isHtmlDocument(html)) {
    let doc = html;

    doc = stripStylesheetLinkTag(doc);
    doc = stripMainScriptTag(doc);
    doc = injectIntoHead(doc, `<style>${css}</style>`);
    doc = injectIntoBody(doc, scriptBlock);

    return doc;
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${css}</style>
  </head>
  <body>
    ${html}
    ${scriptBlock}
  </body>
</html>`;
}
