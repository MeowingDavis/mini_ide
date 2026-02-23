function AssistantModeSwitch({ mode, onChange, disabled }) {
  return (
    <div className="ai-section ai-section-compact">
      <div className="ai-label">Mode</div>
      <div className="ai-mode-switch">
        <button
          type="button"
          className={`btn ${mode === 'chat' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => onChange('chat')}
          disabled={disabled}
        >
          Chat (Propose)
        </button>
        <button
          type="button"
          className={`btn ${mode === 'edit' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => onChange('edit')}
          disabled={disabled}
        >
          Suggest Edits
        </button>
      </div>
    </div>
  );
}

export default AssistantModeSwitch;
