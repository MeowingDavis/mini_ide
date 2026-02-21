function ConsolePanel({ entries, onClear }) {
  return (
    <div className="console-panel">
      <div className="panel-subheader">
        <span className="panel-subtitle">Console</span>
        <button type="button" className="btn btn-ghost btn-small" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="console-list">
        {entries.length === 0 && <div className="console-empty">No logs yet.</div>}
        {entries.map((entry) => (
          <div key={entry.id} className={`console-entry level-${entry.level}`}>
            <span className="level-tag">[{entry.level.toUpperCase()}]</span>
            <pre>{entry.text}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ConsolePanel;
