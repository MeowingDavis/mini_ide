function ToggleRow({ includeCode, includeSelection, streaming, onChange }) {
  return (
    <div className="ai-section ai-toggles">
      <label className="ai-toggle" htmlFor="ai-include-code">
        <input
          id="ai-include-code"
          type="checkbox"
          checked={includeCode}
          onChange={(event) => onChange('includeCode', event.target.checked)}
        />
        <span>Include project files</span>
      </label>

      <label className="ai-toggle" htmlFor="ai-include-selection">
        <input
          id="ai-include-selection"
          type="checkbox"
          checked={includeSelection}
          onChange={(event) => onChange('includeSelection', event.target.checked)}
        />
        <span>Include editor selection</span>
      </label>

      <label className="ai-toggle" htmlFor="ai-streaming">
        <input
          id="ai-streaming"
          type="checkbox"
          checked={streaming}
          onChange={(event) => onChange('streaming', event.target.checked)}
        />
        <span>Stream response</span>
      </label>
    </div>
  );
}

export default ToggleRow;
