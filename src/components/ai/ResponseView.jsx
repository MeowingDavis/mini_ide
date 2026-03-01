import { useEffect, useRef } from 'react';

function splitCodeFenceSegments(text) {
  const source = String(text || '');
  const segments = [];
  const codeFence = /```([^\n`]*)\n([\s\S]*?)```/g;
  let cursor = 0;
  let match = codeFence.exec(source);

  while (match) {
    if (match.index > cursor) {
      segments.push({
        type: 'text',
        content: source.slice(cursor, match.index)
      });
    }

    segments.push({
      type: 'code',
      language: (match[1] || '').trim(),
      content: match[2] || ''
    });

    cursor = codeFence.lastIndex;
    match = codeFence.exec(source);
  }

  if (cursor < source.length) {
    segments.push({
      type: 'text',
      content: source.slice(cursor)
    });
  }

  if (segments.length === 0) {
    return [{ type: 'text', content: source }];
  }

  return segments;
}

function ResponseView({
  messages = [],
  response,
  onCopy,
  isBusy,
  mode,
  pendingEdits = [],
  editSummary = '',
  onApplySingleEdit,
  onApplyAllEdits,
  onCopyEdit,
  onSwapInEdit,
  onInjectInlineCode,
  activeFile
}) {
  const label = mode === 'chat' ? 'Leaf chat' : 'Suggest Edits';
  const threadRef = useRef(null);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [messages, response, isBusy]);

  return (
    <div className="ai-section ai-response">
      <div className="ai-response-header">
        <div className="ai-response-title-wrap">
          <div className="ai-label">{label}</div>
          <span className="ai-response-badge">{mode === 'chat' ? 'Chat' : 'JSON'}</span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={onCopy}
          disabled={!response}
        >
          Copy
        </button>
      </div>
      <div ref={threadRef} className="ai-chat-thread" aria-live="polite">
        {messages.length === 0 && !response && !isBusy ? (
          <div className="ai-chat-empty">
            Ask about the file in the editor, request a refactor, or ask for a fix.
          </div>
        ) : null}

        {messages.map((message, index) => {
          const isUser = message.role === 'user';
          const segments = isUser ? null : splitCodeFenceSegments(message.content);
          const hasInlineCode = !isUser && segments.some((segment) => segment.type === 'code');
          return (
            <div
              key={`${message.role}-${index}`}
              className={`ai-chat-message ${isUser ? 'ai-chat-message-user' : 'ai-chat-message-assistant'}`}
            >
              <div className={`ai-chat-avatar ${isUser ? 'ai-chat-avatar-user' : ''}`} aria-hidden="true">
                {isUser ? 'You' : 'AI'}
              </div>
              {hasInlineCode ? (
                <div className="ai-chat-bubble ai-chat-bubble-rich">
                  {segments.map((segment, segmentIndex) => {
                    if (segment.type === 'text') {
                      if (!segment.content) {
                        return null;
                      }
                      return (
                        <pre key={`text-${segmentIndex}`} className="ai-chat-text">
                          {segment.content}
                        </pre>
                      );
                    }

                    return (
                      <div key={`code-${segmentIndex}`} className="ai-inline-code-block">
                        <div className="ai-inline-code-head">
                          <span className="ai-inline-code-label">
                            {segment.language || 'code'}
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            onClick={() => onInjectInlineCode?.(segment.content)}
                            disabled={!activeFile}
                            title={
                              activeFile
                                ? `Inject into ${activeFile}`
                                : 'No active file selected'
                            }
                          >
                            Inject into active file
                          </button>
                        </div>
                        <pre className="ai-edit-preview ai-inline-code-preview">{segment.content}</pre>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <pre className={`ai-chat-bubble ${isUser ? 'ai-chat-bubble-user' : ''}`}>
                  {message.content}
                </pre>
              )}
            </div>
          );
        })}

        {isBusy ? (
          <div className="ai-chat-message ai-chat-message-assistant">
            <div className="ai-chat-avatar" aria-hidden="true">
              AI
            </div>
            <pre className="ai-chat-bubble ai-chat-bubble-streaming">
              {response?.trim().startsWith('{') ? 'Preparing suggested code...' : response || 'Generating response...'}
            </pre>
          </div>
        ) : null}

        {!isBusy && pendingEdits.length > 0 ? (
          <div className="ai-chat-inline-edits">
            <div className="ai-chat-inline-edits-head">
              <span className="ai-label">{editSummary || 'Suggested code'}</span>
              <button type="button" className="btn btn-primary btn-small" onClick={onApplyAllEdits}>
                Apply All to Files
              </button>
            </div>
            <div className="ai-edit-list">
              {pendingEdits.map((edit, index) => (
                <div key={`${edit.file}-${index}`} className="ai-edit-item">
                  <div className="ai-edit-item-head">
                    <span className="ai-edit-file">{edit.file}</span>
                    <div className="ai-chat-inline-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => onCopyEdit?.(edit)}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => onApplySingleEdit?.(edit)}
                      >
                        Apply to file
                      </button>
                    </div>
                  </div>
                  {Array.isArray(edit.alternatives) && edit.alternatives.length > 0 ? (
                    <div className="ai-edit-alternatives">
                      <span className="ai-status">
                        Current: {edit.activeLabel || 'Suggestion 1'}
                      </span>
                      <div className="ai-chat-inline-actions ai-edit-swap-list">
                        {edit.alternatives.map((option, optionIndex) => (
                          <button
                            key={`${edit.file}-alt-${optionIndex}`}
                            type="button"
                            className="btn btn-ghost btn-small"
                            onClick={() => onSwapInEdit?.(edit.file, optionIndex)}
                          >
                            Swap in {option.label || `Suggestion ${optionIndex + 2}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <pre className="ai-edit-preview">{edit.content}</pre>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ResponseView;
