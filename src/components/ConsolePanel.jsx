import UiIcon from './UiIcon';

function ConsolePanel({ entries, onClear, onClose, onZoom, showWindowControls = true }) {
  return (
    <div className="console-panel">
      <div className="panel-subheader">
        <div className="panel-subheader-main">
          {showWindowControls ? (
            <div className="panel-window-controls" role="toolbar" aria-label="Console window controls">
              <button
                type="button"
                className="window-control window-control-close"
                onClick={onClose}
                aria-label="Close console window"
                title="Close console window"
              />
              <button
                type="button"
                className="window-control window-control-zoom"
                onClick={onZoom}
                aria-label="Enlarge console window"
                title="Enlarge console window"
              />
            </div>
          ) : null}
          <span className="panel-subtitle panel-subtitle-with-icon">
            <UiIcon name="console" className="panel-subtitle-icon" />
            <span>Console</span>
          </span>
        </div>
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
