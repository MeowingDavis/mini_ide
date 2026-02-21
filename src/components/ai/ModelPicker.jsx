function ModelPicker({ models, selectedModel, onChange, onRefresh, isLoading, showRefresh = true }) {
  return (
    <div className="ai-section">
      <label className="ai-label" htmlFor="ai-model-select">
        Model
      </label>
      <div className="ai-row">
        <select
          id="ai-model-select"
          className="select ai-select"
          value={selectedModel}
          onChange={(event) => onChange(event.target.value)}
          disabled={models.length === 0}
        >
          {models.length === 0 && <option value="">No models available</option>}
          {models.map((modelName) => (
            <option key={modelName} value={modelName}>
              {modelName}
            </option>
          ))}
        </select>
        {showRefresh ? (
          <button type="button" className="btn btn-ghost" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default ModelPicker;
