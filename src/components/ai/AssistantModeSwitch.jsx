function AssistantModeSwitch({ mode, onChange, disabled }) {
  return (
    <div className="ai-section">
      <div className="ai-label">Assistant Mode</div>
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
          Edit (Auto-Apply)
        </button>
      </div>
    </div>
  );
}

export default AssistantModeSwitch;
