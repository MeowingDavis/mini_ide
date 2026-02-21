function ResponseView({ response, onCopy, isBusy, mode }) {
  const label = mode === 'chat' ? 'Copilot Chat' : 'Assistant Output';
  const emptyState = isBusy ? 'Generating response...' : 'No response yet.';

  return (
    <div className="ai-section ai-response">
      <div className="ai-response-header">
        <div className="ai-label">{label}</div>
        <button type="button" className="btn btn-ghost btn-small" onClick={onCopy} disabled={!response}>
          Copy
        </button>
      </div>
      <pre className="ai-response-text">{response || emptyState}</pre>
    </div>
  );
}

export default ResponseView;
