export const DEFAULT_PROJECT_FILES = {
  'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  
  <script src="main.js" defer></script>
</body>
</html>`,
  'styles.css': ``,
  'main.js': ``
};

export const FILE_ORDER = ['index.html', 'styles.css', 'main.js'];

export const FILE_LANGUAGE = {
  'index.html': 'html',
  'styles.css': 'css',
  'main.js': 'javascript'
};

const LANGUAGE_BY_EXTENSION = {
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'plaintext',
  xml: 'xml',
  svg: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  sh: 'shell',
  bash: 'shell',
  py: 'python',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  go: 'go',
  rs: 'rust',
  sql: 'sql'
};

function getExtension(fileName) {
  const value = String(fileName || '');
  const baseName = value.split('/').pop() || value;
  const parts = baseName.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export function inferLanguageFromFileName(fileName) {
  if (FILE_LANGUAGE[fileName]) {
    return FILE_LANGUAGE[fileName];
  }

  return LANGUAGE_BY_EXTENSION[getExtension(fileName)] || 'plaintext';
}

export function getSortedFileNames(files) {
  const fileNames = Object.keys(files || {});
  const priority = new Map(FILE_ORDER.map((fileName, index) => [fileName, index]));

  return fileNames.sort((a, b) => {
    const aPriority = priority.has(a) ? priority.get(a) : Number.POSITIVE_INFINITY;
    const bPriority = priority.has(b) ? priority.get(b) : Number.POSITIVE_INFINITY;

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    return a.localeCompare(b);
  });
}

export function getDefaultActiveFile(files) {
  const sorted = getSortedFileNames(files);
  return sorted[0] || '';
}

export function getStarterContentForFile(fileName) {
  const extension = getExtension(fileName);

  if (fileName === 'index.html' || extension === 'html' || extension === 'htm') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName}</title>
</head>
<body>
  
</body>
</html>`;
  }

  if (extension === 'css' || extension === 'scss' || extension === 'sass' || extension === 'less') {
    return `/* ${fileName} */\n`;
  }

  if (['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx'].includes(extension)) {
    return `// ${fileName}\n`;
  }

  if (extension === 'json') {
    return `{\n  \n}\n`;
  }

  if (extension === 'md' || extension === 'markdown') {
    return `# ${fileName}\n`;
  }

  if (extension === 'svg') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  <circle cx="50" cy="50" r="40" fill="tomato" />\n</svg>\n`;
  }

  return '';
}
