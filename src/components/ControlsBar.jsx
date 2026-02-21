function ControlsBar({ onRun, autoRun, onAutoRunChange, onClearConsole, onResetProject }) {
  return (
    <div className="controls-bar">
      <button type="button" className="btn btn-primary" onClick={onRun}>
        Run
      </button>

      <label className="toggle" htmlFor="auto-run-toggle">
        <input
          id="auto-run-toggle"
          type="checkbox"
          checked={autoRun}
          onChange={(event) => onAutoRunChange(event.target.checked)}
        />
        <span>Auto-run</span>
      </label>

      <button type="button" className="btn" onClick={onClearConsole}>
        Clear Console
      </button>

      <button type="button" className="btn" onClick={onResetProject}>
        Reset Project
      </button>
    </div>
  );
}

export default ControlsBar;
