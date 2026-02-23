import { useEffect, useRef } from 'react';

function ResponseView({ messages = [], response, onCopy, isBusy, mode }) {
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
          return (
            <div
              key={`${message.role}-${index}`}
              className={`ai-chat-message ${isUser ? 'ai-chat-message-user' : 'ai-chat-message-assistant'}`}
            >
              <div className={`ai-chat-avatar ${isUser ? 'ai-chat-avatar-user' : ''}`} aria-hidden="true">
                {isUser ? 'You' : 'AI'}
              </div>
              <pre className={`ai-chat-bubble ${isUser ? 'ai-chat-bubble-user' : ''}`}>
                {message.content}
              </pre>
            </div>
          );
        })}

        {isBusy ? (
          <div className="ai-chat-message ai-chat-message-assistant">
            <div className="ai-chat-avatar" aria-hidden="true">
              AI
            </div>
            <pre className="ai-chat-bubble ai-chat-bubble-streaming">
              {response || 'Generating response...'}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ResponseView;
