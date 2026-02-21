function EndpointInput({
  label,
  endpoint,
  placeholder,
  onChange,
  onTest,
  isTesting,
  status,
  testLabel = 'Test connection'
}) {
  return (
    <div className="ai-section">
      <label className="ai-label" htmlFor="ai-endpoint-input">
        {label}
      </label>
      <div className="ai-row">
        <input
          id="ai-endpoint-input"
          className="input ai-input"
          value={endpoint}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        <button type="button" className="btn btn-ghost" onClick={onTest} disabled={isTesting}>
          {isTesting ? 'Testing...' : testLabel}
        </button>
      </div>
      {status ? <div className="ai-status">{status}</div> : null}
    </div>
  );
}

export default EndpointInput;
