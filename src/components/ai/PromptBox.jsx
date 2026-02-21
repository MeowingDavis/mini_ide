function PromptBox({ prompt, onPromptChange, onAsk, onAction, disabled, mode }) {
  const askLabel = mode === 'edit' ? 'Edit & Apply' : 'Ask';

  return (
    <div className="ai-section ai-prompt-box">
      <label className="ai-label" htmlFor="ai-prompt-textarea">
        Prompt
      </label>
      <textarea
        id="ai-prompt-textarea"
        className="textarea ai-textarea"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder="Ask the model about your code..."
      />

      <div className="ai-actions">
        <button type="button" className="btn btn-primary" onClick={onAsk} disabled={disabled}>
          {askLabel}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onAction('explain_selection')}
          disabled={disabled}
        >
          Explain selection
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onAction('refactor_selection')}
          disabled={disabled}
        >
          Refactor selection
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onAction('fix_console_error')}
          disabled={disabled}
        >
          Fix console error
        </button>
      </div>
    </div>
  );
}

export default PromptBox;
