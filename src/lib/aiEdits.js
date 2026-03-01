function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeAlternatives(edit, primaryContent) {
  const rawAlternatives = Array.isArray(edit?.alternatives)
    ? edit.alternatives
    : Array.isArray(edit?.suggestions)
      ? edit.suggestions
      : [];

  const seen = new Set([primaryContent]);

  return rawAlternatives
    .map((option, index) => {
      if (typeof option === 'string') {
        return {
          label: `Suggestion ${index + 2}`,
          content: option
        };
      }

      if (option && typeof option === 'object' && typeof option.content === 'string') {
        return {
          label:
            typeof option.label === 'string' && option.label.trim()
              ? option.label.trim()
              : `Suggestion ${index + 2}`,
          content: option.content
        };
      }

      return null;
    })
    .filter((option) => option && !seen.has(option.content))
    .filter((option) => {
      seen.add(option.content);
      return true;
    });
}

function extractJsonCandidate(text) {
  const fencedMatches = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const match of fencedMatches) {
    const parsed = tryParseJson(match[1].trim());
    if (parsed) {
      return parsed;
    }
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');

  if (start !== -1 && end !== -1 && end > start) {
    const parsed = tryParseJson(text.slice(start, end + 1));
    if (parsed) {
      return parsed;
    }
  }

  return tryParseJson(text);
}

export function parseEditResponse(responseText, allowedFiles) {
  const parsed = extractJsonCandidate(responseText || '');
  if (!parsed || typeof parsed !== 'object') {
    return {
      summary: '',
      edits: [],
      error: 'Edit mode response must be valid JSON.'
    };
  }

  const edits = Array.isArray(parsed.edits) ? parsed.edits : [];
  const normalizedEdits = edits
    .map((edit) => {
      const content = typeof edit.content === 'string' ? edit.content : '';
      return {
        file: typeof edit.file === 'string' ? edit.file.trim() : '',
        content,
        alternatives: normalizeAlternatives(edit, content)
      };
    })
    .filter((edit) => edit.file && allowedFiles.includes(edit.file));

  if (normalizedEdits.length === 0) {
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      edits: [],
      error: `No valid edits found. Allowed files: ${allowedFiles.join(', ')}`
    };
  }

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    edits: normalizedEdits,
    error: ''
  };
}

export function tryExtractEdits(responseText, allowedFiles) {
  const parsed = extractJsonCandidate(responseText || '');
  if (!parsed || typeof parsed !== 'object') {
    return {
      summary: '',
      edits: []
    };
  }

  const edits = Array.isArray(parsed.edits) ? parsed.edits : [];
  const normalizedEdits = edits
    .map((edit) => {
      const content = typeof edit.content === 'string' ? edit.content : '';
      return {
        file: typeof edit.file === 'string' ? edit.file.trim() : '',
        content,
        alternatives: normalizeAlternatives(edit, content)
      };
    })
    .filter((edit) => edit.file && allowedFiles.includes(edit.file));

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    edits: normalizedEdits
  };
}
