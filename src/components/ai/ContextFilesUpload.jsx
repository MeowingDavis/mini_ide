function ContextFilesUpload({
  uploadedDocs,
  includeUploads,
  onIncludeUploadsChange,
  onUpload,
  onRemove,
  onClearAll,
  isUploading
}) {
  return (
    <div className="ai-section">
      <div className="ai-upload-head">
        <span className="ai-label">Uploaded Context</span>
        <label className="ai-toggle" htmlFor="ai-include-uploads">
          <input
            id="ai-include-uploads"
            type="checkbox"
            checked={includeUploads}
            onChange={(event) => onIncludeUploadsChange(event.target.checked)}
          />
          <span>Include in prompt</span>
        </label>
      </div>

      <div className="ai-row">
        <input
          type="file"
          className="input ai-file-input"
          multiple
          onChange={onUpload}
          accept=".md,.txt,.json,.yaml,.yml,.xml,.csv,.js,.jsx,.css,.html"
        />
      </div>

      {isUploading ? <div className="ai-status">Uploading files...</div> : null}

      <div className="ai-doc-list">
        {uploadedDocs.length === 0 ? (
          <div className="ai-status">No uploaded files.</div>
        ) : (
          uploadedDocs.map((doc) => (
            <div key={doc.id} className="ai-doc-item">
              <span>{doc.name}</span>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => onRemove(doc.id)}>
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      {uploadedDocs.length > 0 ? (
        <button type="button" className="btn btn-danger" onClick={onClearAll}>
          Clear Uploaded Files
        </button>
      ) : null}
    </div>
  );
}

export default ContextFilesUpload;
