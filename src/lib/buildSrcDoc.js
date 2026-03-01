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

function isHtmlWhitespace(value) {
  return value === ' ' || value === '\t' || value === '\n' || value === '\r' || value === '\f';
}

function findTagEnd(source, fromIndex) {
  let quote = '';
  for (let index = fromIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') {
      return index;
    }
  }
  return -1;
}

function parseTagAt(source, startIndex) {
  if (source[startIndex] !== '<') {
    return null;
  }

  const nextChar = source[startIndex + 1];
  if (!nextChar || nextChar === '!' || nextChar === '?') {
    return null;
  }

  let cursor = startIndex + 1;
  let isClosing = false;
  if (source[cursor] === '/') {
    isClosing = true;
    cursor += 1;
  }

  while (cursor < source.length && isHtmlWhitespace(source[cursor])) {
    cursor += 1;
  }

  const nameStart = cursor;
  while (cursor < source.length) {
    const char = source[cursor];
    if (
      isHtmlWhitespace(char) ||
      char === '/' ||
      char === '>' ||
      char === '"' ||
      char === "'" ||
      char === '='
    ) {
      break;
    }
    cursor += 1;
  }

  if (cursor === nameStart) {
    return null;
  }

  const endIndex = findTagEnd(source, cursor);
  if (endIndex === -1) {
    return null;
  }

  const attributesSource = source.slice(cursor, endIndex);
  let tailIndex = endIndex - 1;
  while (tailIndex > cursor && isHtmlWhitespace(source[tailIndex])) {
    tailIndex -= 1;
  }

  return {
    start: startIndex,
    end: endIndex,
    name: source.slice(nameStart, cursor).toLowerCase(),
    isClosing,
    isSelfClosing: !isClosing && source[tailIndex] === '/',
    attributesSource
  };
}

function findNextTag(source, fromIndex = 0) {
  let cursor = fromIndex;
  while (cursor < source.length) {
    const openIndex = source.indexOf('<', cursor);
    if (openIndex === -1) {
      return null;
    }

    const nextChar = source[openIndex + 1];
    if (nextChar === '!') {
      if (source.startsWith('<!--', openIndex)) {
        const commentEnd = source.indexOf('-->', openIndex + 4);
        cursor = commentEnd === -1 ? source.length : commentEnd + 3;
        continue;
      }
      const specialEnd = findTagEnd(source, openIndex + 2);
      cursor = specialEnd === -1 ? source.length : specialEnd + 1;
      continue;
    }

    if (nextChar === '?') {
      const processingEnd = findTagEnd(source, openIndex + 2);
      cursor = processingEnd === -1 ? source.length : processingEnd + 1;
      continue;
    }

    const tag = parseTagAt(source, openIndex);
    if (tag) {
      return tag;
    }

    cursor = openIndex + 1;
  }

  return null;
}

function parseTagAttributes(attributesSource) {
  const attributes = [];
  let cursor = 0;

  while (cursor < attributesSource.length) {
    while (cursor < attributesSource.length && isHtmlWhitespace(attributesSource[cursor])) {
      cursor += 1;
    }

    if (cursor >= attributesSource.length || attributesSource[cursor] === '/') {
      break;
    }

    const nameStart = cursor;
    while (cursor < attributesSource.length) {
      const char = attributesSource[cursor];
      if (isHtmlWhitespace(char) || char === '=' || char === '>') {
        break;
      }
      cursor += 1;
    }

    if (cursor === nameStart) {
      cursor += 1;
      continue;
    }

    const name = attributesSource.slice(nameStart, cursor);

    while (cursor < attributesSource.length && isHtmlWhitespace(attributesSource[cursor])) {
      cursor += 1;
    }

    let value = null;
    if (attributesSource[cursor] === '=') {
      cursor += 1;
      while (cursor < attributesSource.length && isHtmlWhitespace(attributesSource[cursor])) {
        cursor += 1;
      }

      if (attributesSource[cursor] === '"' || attributesSource[cursor] === "'") {
        const quote = attributesSource[cursor];
        cursor += 1;
        const valueStart = cursor;
        while (cursor < attributesSource.length && attributesSource[cursor] !== quote) {
          cursor += 1;
        }
        value = attributesSource.slice(valueStart, cursor);
        if (cursor < attributesSource.length) {
          cursor += 1;
        }
      } else {
        const valueStart = cursor;
        while (cursor < attributesSource.length && !isHtmlWhitespace(attributesSource[cursor]) && attributesSource[cursor] !== '>') {
          cursor += 1;
        }
        value = attributesSource.slice(valueStart, cursor);
      }
    }

    attributes.push({
      nameLower: name.toLowerCase(),
      raw: attributesSource.slice(nameStart, cursor),
      value
    });
  }

  return attributes;
}

function getTagAttributeValue(attributes, targetName) {
  for (const attribute of attributes) {
    if (attribute.nameLower === targetName) {
      return attribute.value == null ? '' : attribute.value;
    }
  }
  return null;
}

function buildTagAttributes(attributes, omittedNames = []) {
  const omitted = new Set(omittedNames);
  const kept = attributes
    .filter((attribute) => !omitted.has(attribute.nameLower))
    .map((attribute) => String(attribute.raw || '').trim())
    .filter(Boolean);
  return kept.length > 0 ? ` ${kept.join(' ')}` : '';
}

function isModuleScriptTag(attributes) {
  const type = getTagAttributeValue(attributes, 'type');
  return String(type || '').trim().toLowerCase() === 'module';
}

function findClosingScriptTag(source, fromIndex) {
  const lowerSource = source.toLowerCase();
  let cursor = fromIndex;

  while (cursor < source.length) {
    const closeStart = lowerSource.indexOf('</script', cursor);
    if (closeStart === -1) {
      return null;
    }

    const closeTag = parseTagAt(source, closeStart);
    if (closeTag && closeTag.isClosing && closeTag.name === 'script') {
      return closeTag;
    }

    cursor = closeStart + 1;
  }

  return null;
}

function applyTagEdits(source, edits) {
  if (!edits.length) {
    return source;
  }

  const sorted = [...edits].sort((left, right) => left.start - right.start);
  let cursor = 0;
  let result = '';

  for (const edit of sorted) {
    if (edit.start < cursor) {
      continue;
    }
    result += source.slice(cursor, edit.start);
    result += edit.replacement;
    cursor = edit.end;
  }

  result += source.slice(cursor);
  return result;
}

function stripLinkedStylesheetTag(source, filePath) {
  const html = String(source || '');
  const edits = [];
  let cursor = 0;

  while (true) {
    const tag = findNextTag(html, cursor);
    if (!tag) {
      break;
    }
    cursor = tag.end + 1;

    if (tag.isClosing || tag.name !== 'link') {
      continue;
    }

    const attributes = parseTagAttributes(tag.attributesSource);
    const href = getTagAttributeValue(attributes, 'href');
    if (href == null) {
      continue;
    }

    const normalizedPath = normalizeProjectPath(href);
    if (isLocalPath(href) && normalizedPath === filePath) {
      edits.push({ start: tag.start, end: tag.end + 1, replacement: '' });
    }
  }

  return applyTagEdits(html, edits);
}

function stripLinkedScriptTag(source, filePath) {
  const html = String(source || '');
  const edits = [];
  let cursor = 0;

  while (true) {
    const tag = findNextTag(html, cursor);
    if (!tag) {
      break;
    }

    cursor = tag.end + 1;
    if (tag.isClosing || tag.name !== 'script') {
      continue;
    }

    const closeTag = tag.isSelfClosing ? null : findClosingScriptTag(html, tag.end + 1);
    if (closeTag) {
      cursor = closeTag.end + 1;
    }

    const attributes = parseTagAttributes(tag.attributesSource);
    const src = getTagAttributeValue(attributes, 'src');
    if (src == null) {
      continue;
    }

    const normalizedPath = normalizeProjectPath(src);
    if (!isLocalPath(src) || normalizedPath !== filePath) {
      continue;
    }

    edits.push({
      start: tag.start,
      end: (closeTag ? closeTag.end : tag.end) + 1,
      replacement: ''
    });
  }

  return applyTagEdits(html, edits);
}

function inlineLinkedProjectAssets(source, files, moduleContext) {
  const html = String(source || '');
  const inlinedCss = new Set();
  const inlinedJs = new Set();
  const inlinedModuleEntries = new Set();
  const edits = [];
  let cursor = 0;

  while (true) {
    const tag = findNextTag(html, cursor);
    if (!tag) {
      break;
    }

    cursor = tag.end + 1;
    if (tag.isClosing) {
      continue;
    }

    if (tag.name === 'link') {
      const attributes = parseTagAttributes(tag.attributesSource);
      const href = getTagAttributeValue(attributes, 'href');
      if (href == null) {
        continue;
      }

      const normalizedPath = normalizeProjectPath(href);
      if (!isLocalPath(href) || !normalizedPath.toLowerCase().endsWith('.css')) {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(files, normalizedPath)) {
        continue;
      }

      inlinedCss.add(normalizedPath);
      const attrs = buildTagAttributes(attributes, ['href']);
      edits.push({
        start: tag.start,
        end: tag.end + 1,
        replacement: `<style data-inline-file="${normalizedPath}"${attrs}>${files[normalizedPath] || ''}</style>`
      });
      continue;
    }

    if (tag.name === 'script') {
      const closeTag = tag.isSelfClosing ? null : findClosingScriptTag(html, tag.end + 1);
      if (closeTag) {
        cursor = closeTag.end + 1;
      }

      const attributes = parseTagAttributes(tag.attributesSource);
      const src = getTagAttributeValue(attributes, 'src');
      if (src == null) {
        continue;
      }

      const normalizedPath = normalizeProjectPath(src);
      if (!isLocalPath(src) || !/\.(js|mjs|cjs)$/i.test(normalizedPath)) {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(files, normalizedPath) || !closeTag) {
        continue;
      }

      inlinedJs.add(normalizedPath);
      const attrs = buildTagAttributes(attributes, ['src']);
      const isModuleScript = isModuleScriptTag(attributes);
      const scriptContent =
        isModuleScript && moduleContext?.rewrittenByPath?.[normalizedPath] != null
          ? moduleContext.rewrittenByPath[normalizedPath]
          : files[normalizedPath] || '';
      if (isModuleScript) {
        inlinedModuleEntries.add(normalizedPath);
      }

      edits.push({
        start: tag.start,
        end: closeTag.end + 1,
        replacement: `<script data-inline-file="${normalizedPath}"${attrs}>${escapeClosingScriptTag(
          scriptContent
        )}</script>`
      });
    }
  }

  return { html: applyTagEdits(html, edits), inlinedCss, inlinedJs, inlinedModuleEntries };
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
