function formatCodeBlock(language, code) {
  return `\`\`\`${language}\n${code || ''}\n\`\`\``;
}

function formatFiles(files) {
  return [
    `index.html:\n${formatCodeBlock('html', files['index.html'])}`,
    `styles.css:\n${formatCodeBlock('css', files['styles.css'])}`,
    `main.js:\n${formatCodeBlock('javascript', files['main.js'])}`
  ].join('\n\n');
}

function formatConsoleContext(consoleLogs, lastRuntimeError) {
  const recentLogs = consoleLogs.slice(-12).map((entry) => `[${entry.level}] ${entry.text}`);
  const chunks = [];

  if (lastRuntimeError) {
    chunks.push(`Last runtime error:\n${lastRuntimeError}`);
  }

  if (recentLogs.length > 0) {
    chunks.push(`Recent console logs:\n${recentLogs.join('\n')}`);
  }

  return chunks.join('\n\n');
}

function formatUploadedDocs(uploadedDocs) {
  return uploadedDocs
    .map((doc) => `${doc.name}:\n${formatCodeBlock('text', doc.content)}`)
    .join('\n\n');
}

export function buildAiPrompt({
  action,
  question,
  provider,
  model,
  mode,
  activeTab,
  selection,
  files,
  includeCode,
  includeSelection,
  includeUploads,
  uploadedDocs,
  consoleLogs,
  lastRuntimeError
}) {
  const parts = [];

  parts.push(`Action: ${action}`);
  parts.push(`Mode: ${mode}`);
  parts.push(`Provider: ${provider || 'ollama'}`);
  parts.push(`Selected model: ${model}`);
  parts.push(`Active tab: ${activeTab}`);

  const trimmedQuestion = (question || '').trim();
  if (trimmedQuestion) {
    parts.push(`User request:\n${trimmedQuestion}`);
  }

  if (includeSelection && selection) {
    parts.push(`Editor selection:\n${formatCodeBlock('text', selection)}`);
  }

  if (includeCode) {
    parts.push(`Project files:\n\n${formatFiles(files)}`);
  }

  if (includeUploads && uploadedDocs.length > 0) {
    parts.push(`Uploaded context files:\n\n${formatUploadedDocs(uploadedDocs)}`);
  }

  const consoleContext = formatConsoleContext(consoleLogs, lastRuntimeError);
  if (consoleContext) {
    parts.push(consoleContext);
  }

  return parts.join('\n\n');
}
