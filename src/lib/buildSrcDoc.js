function escapeClosingScriptTag(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

const MODULE_IMPORT_PREFIX = '/__mini_ide_modules__/';

function isHtmlDocument(source) {
  const trimmed = String(source || '').trimStart();
  return /<!doctype\s+html/i.test(trimmed) || /<html[\s>]/i.test(trimmed);
}

function isLocalPath(value) {
  const path = String(value || '').trim();
  if (!path) return false;
  if (path.startsWith('#')) return false;
  if (path.startsWith('//')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  return true;
}

function normalizeProjectPath(value) {
  const cleanPath = String(value || '')
    .trim()
    .split('#')[0]
    .split('?')[0]
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');

  const parts = cleanPath.split('/');
  const normalizedParts = [];
  for (const part of parts) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      normalizedParts.pop();
      continue;
    }
    normalizedParts.push(part);
  }

  return normalizedParts.join('/');
}

function collectTagAttributes(before, after) {
  const raw = `${before || ''}${after || ''}`;
  const trimmed = raw.replace(/^\s+|\s+$/g, '');
  return trimmed ? ` ${trimmed}` : '';
}

function isScriptFilePath(path) {
  return /\.(js|mjs|cjs)$/i.test(String(path || ''));
}

function getParentFolder(path) {
  const normalized = normalizeProjectPath(path);
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : '';
}

function resolveScriptFilePath(path, files) {
  const normalized = normalizeProjectPath(path);
  if (!normalized) {
    return '';
  }

  if (Object.prototype.hasOwnProperty.call(files, normalized) && isScriptFilePath(normalized)) {
    return normalized;
  }

  if (/\.[a-z0-9]+$/i.test(normalized)) {
    return '';
  }

  const extensions = ['.js', '.mjs', '.cjs'];
  for (const extension of extensions) {
    const candidate = `${normalized}${extension}`;
    if (Object.prototype.hasOwnProperty.call(files, candidate)) {
      return candidate;
    }
  }

  return '';
}

function isResolvableLocalModuleSpecifier(specifier) {
  const trimmed = String(specifier || '').trim();
  return trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('/');
}

function resolveLocalModuleImport(fromFilePath, specifier, files) {
  if (!isResolvableLocalModuleSpecifier(specifier)) {
    return '';
  }

  if (specifier.startsWith('/')) {
    return resolveScriptFilePath(specifier, files);
  }

  const parent = getParentFolder(fromFilePath);
  const joined = parent ? `${parent}/${specifier}` : specifier;
  return resolveScriptFilePath(joined, files);
}

function rewriteModuleSpecifiers(source, fromFilePath, files) {
  const code = String(source || '');
  return code.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"']+)\2/g, (match, prefix, quote, specifier) => {
    const resolved = resolveLocalModuleImport(fromFilePath, specifier, files);
    if (!resolved) {
      return match;
    }
    return `${prefix}${quote}${MODULE_IMPORT_PREFIX}${resolved}${quote}`;
  });
}

function buildModuleImportMap(files) {
  const imports = {};
  const rewrittenByPath = {};

  for (const filePath of Object.keys(files || {})) {
    if (!isScriptFilePath(filePath)) {
      continue;
    }

    const rewritten = rewriteModuleSpecifiers(files[filePath] || '', filePath, files);
    rewrittenByPath[filePath] = rewritten;
    imports[`${MODULE_IMPORT_PREFIX}${filePath}`] = `data:text/javascript;charset=utf-8,${encodeURIComponent(
      rewritten
    )}`;
  }

  return { imports, rewrittenByPath };
}

function isModuleScriptTagAttributes(attributes) {
  return /\btype\s*=\s*(?:(["'])module\1|module\b)/i.test(attributes);
}

function stripLinkedStylesheetTag(source, filePath) {
  return source.replace(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi, (match, href) => {
    const normalizedPath = normalizeProjectPath(href);
    if (!isLocalPath(href) || normalizedPath !== filePath) {
      return match;
    }
    return '';
  });
}

function stripLinkedScriptTag(source, filePath) {
  return source.replace(
    /<script\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>\s*<\/\s*script[^>]*>/gi,
    (match, src) => {
      const normalizedPath = normalizeProjectPath(src);
      if (!isLocalPath(src) || normalizedPath !== filePath) {
        return match;
      }
      return '';
    }
  );
}

function inlineLinkedProjectAssets(source, files, moduleContext) {
  const inlinedCss = new Set();
  const inlinedJs = new Set();
  const inlinedModuleEntries = new Set();
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
    const attrs = collectTagAttributes(before, after);
    return `<style data-inline-file="${normalizedPath}"${attrs}>${files[normalizedPath] || ''}</style>`;
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
      const attrs = collectTagAttributes(before, after);
      const isModuleScript = isModuleScriptTagAttributes(attrs);
      const scriptContent =
        isModuleScript && moduleContext?.rewrittenByPath?.[normalizedPath] != null
          ? moduleContext.rewrittenByPath[normalizedPath]
          : files[normalizedPath] || '';
      if (isModuleScript) {
        inlinedModuleEntries.add(normalizedPath);
      }
      return `<script data-inline-file="${normalizedPath}"${attrs}>${escapeClosingScriptTag(
        scriptContent
      )}</script>`;
    }
  );

  return { html: next, inlinedCss, inlinedJs, inlinedModuleEntries };
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

function injectIntoHeadStart(source, content) {
  if (/<head[\s>]/i.test(source)) {
    return source.replace(/<head([^>]*)>/i, `<head$1>\n${content}`);
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

function createBridgeScript(messageChannel = '', targetOrigin = '*') {
  return `(() => {
    const CHANNEL = ${JSON.stringify(String(messageChannel || ''))};
    const TARGET_ORIGIN = ${JSON.stringify(String(targetOrigin || '*'))};

    const post = (type, payload = {}) => {
      const message = { source: 'mini-ide-preview', channel: CHANNEL, type, ...payload };

      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(message, TARGET_ORIGIN);
        } else if (window.parent && window.parent !== window) {
          window.parent.postMessage(message, TARGET_ORIGIN);
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

export function buildSrcDoc(files, options = {}) {
  const messageChannel = String(options.messageChannel || '');
  const targetOrigin = String(options.targetOrigin || '*');
  const html = files['index.html'] || '';
  const bridge = escapeClosingScriptTag(createBridgeScript(messageChannel, targetOrigin));
  const fallbackCss = files['styles.css'] || '';
  const fallbackJs = files['main.js'] || '';
  const moduleContext = buildModuleImportMap(files);

  if (isHtmlDocument(html)) {
    let doc = html;
    let inlinedCss = new Set();
    let inlinedJs = new Set();
    let inlinedModuleEntries = new Set();

    const inlineResult = inlineLinkedProjectAssets(doc, files, moduleContext);
    doc = inlineResult.html;
    inlinedCss = inlineResult.inlinedCss;
    inlinedJs = inlineResult.inlinedJs;
    inlinedModuleEntries = inlineResult.inlinedModuleEntries;

    if (inlinedModuleEntries.size > 0 && Object.keys(moduleContext.imports).length > 0) {
      const importMapScript = `<script type="importmap">${JSON.stringify({
        imports: moduleContext.imports
      })}</script>`;
      doc = injectIntoHeadStart(doc, importMapScript);
    }

    if (!inlinedCss.has('styles.css')) {
      doc = stripLinkedStylesheetTag(doc, 'styles.css');
    }
    if (!inlinedJs.has('main.js')) {
      doc = stripLinkedScriptTag(doc, 'main.js');
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
