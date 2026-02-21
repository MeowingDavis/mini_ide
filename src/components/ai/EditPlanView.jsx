function EditPlanView({
  visible,
  title = 'Proposed File Edits',
  planSummary,
  edits,
  onApplyAll,
  onApplySingle,
  disabled
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="ai-section">
      <div className="ai-edit-header">
        <span className="ai-label">{title}</span>
        <button type="button" className="btn btn-primary" onClick={onApplyAll} disabled={disabled}>
          Apply All
        </button>
      </div>

      {planSummary ? <div className="ai-status">{planSummary}</div> : null}

      {edits.length > 0 ? (
        <div className="ai-edit-list">
          {edits.map((edit) => (
            <div key={edit.file} className="ai-edit-item">
              <div className="ai-edit-item-head">
                <span>{edit.file}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => onApplySingle(edit)}
                  disabled={disabled}
                >
                  Apply
                </button>
              </div>
              <pre className="ai-edit-preview">{edit.content}</pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default EditPlanView;
