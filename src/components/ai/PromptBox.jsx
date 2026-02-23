import { useRef } from 'react';

function PromptBox({
  prompt,
  onPromptChange,
  onSend,
  onStop,
  disabled,
  isBusy,
  activeProvider,
  onProviderChange,
  ollamaEndpoint,
  onOllamaEndpointChange,
  selectedModelName,
  models,
  onModelChange,
  onRefreshModels,
  isLoadingModels,
  onTestConnection,
  isTestingConnection,
  statusMessage,
  selectedAction,
  onActionChange,
  uploadedDocs,
  includeCode,
  includeSelection,
  includeUploads,
  streaming,
  onSettingChange,
  hasProvidedGroqModels,
  providedGroqModelsCount,
  onIncludeUploadsChange,
  onUpload,
  onRemoveUpload,
  isUploading
}) {
  const fileInputRef = useRef(null);

  const handleKeyDown = (event) => {
    if (isBusy) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="ai-section ai-prompt-box">
      <div className="ai-prompt-head">
        <label className="ai-label" htmlFor="ai-prompt-textarea">
          Message
        </label>
        <span className="ai-prompt-hint">The assistant uses the active editor file as context.</span>
      </div>
      <textarea
        id="ai-prompt-textarea"
        className="textarea ai-textarea"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about the current file, request a fix, or ask for suggested edits..."
      />

      {uploadedDocs.length > 0 || isUploading ? (
        <div className="ai-composer-uploads">
          {uploadedDocs.map((doc) => (
            <div key={doc.id} className="ai-upload-chip">
              <span className="ai-upload-chip-name">{doc.name}</span>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => onRemoveUpload(doc.id)}
                disabled={disabled}
              >
                x
              </button>
            </div>
          ))}
          {isUploading ? <span className="ai-status">Uploading...</span> : null}
        </div>
      ) : null}

      <div className="ai-composer-row">
        <input
          ref={fileInputRef}
          type="file"
          className="ai-hidden-file-input"
          multiple
          onChange={onUpload}
          accept=".md,.txt,.json,.yaml,.yml,.xml,.csv,.js,.jsx,.css,.html"
        />
        <button
          type="button"
          className="btn btn-ghost ai-plus-btn"
          onClick={openFilePicker}
          disabled={disabled}
          aria-label="Upload documents"
          title="Upload documents"
        >
          +
        </button>

        <select
          className="select ai-select ai-action-select"
          value={selectedAction}
          onChange={(event) => onActionChange(event.target.value)}
          disabled={disabled}
          aria-label="Chat action"
        >
          <option value="ask">Ask</option>
          <option value="explain_selection">Explain selection</option>
          <option value="refactor_selection">Refactor selection</option>
          <option value="fix_console_error">Fix console error</option>
        </select>

        <details className="ai-options-menu">
          <summary className="ai-options-summary">Options</summary>
          <div className="ai-options-panel">
            <label className="ai-toggle" htmlFor="ai-include-code-inline">
              <input
                id="ai-include-code-inline"
                type="checkbox"
                checked={includeCode}
                onChange={(event) => onSettingChange('includeCode', event.target.checked)}
              />
              <span>Include project files</span>
            </label>
            <label className="ai-toggle" htmlFor="ai-include-selection-inline">
              <input
                id="ai-include-selection-inline"
                type="checkbox"
                checked={includeSelection}
                onChange={(event) => onSettingChange('includeSelection', event.target.checked)}
              />
              <span>Include editor selection</span>
            </label>
            <label className="ai-toggle" htmlFor="ai-streaming-inline">
              <input
                id="ai-streaming-inline"
                type="checkbox"
                checked={streaming}
                onChange={(event) => onSettingChange('streaming', event.target.checked)}
              />
              <span>Stream response</span>
            </label>
            <label className="ai-toggle" htmlFor="ai-include-uploads-inline">
              <input
                id="ai-include-uploads-inline"
                type="checkbox"
                checked={includeUploads}
                onChange={(event) => onIncludeUploadsChange(event.target.checked)}
              />
              <span>Use uploads</span>
            </label>
          </div>
        </details>

        <details className="ai-options-menu ai-settings-menu">
          <summary className="ai-options-summary">Settings</summary>
          <div className="ai-options-panel ai-settings-panel">
            <div className="ai-settings-provider">
              <button
                type="button"
                className={`btn ${activeProvider === 'ollama' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => onProviderChange('ollama')}
                disabled={disabled}
              >
                Ollama
              </button>
              <button
                type="button"
                className={`btn ${activeProvider === 'groq' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => onProviderChange('groq')}
                disabled={disabled}
              >
                Groq
              </button>
            </div>

            {activeProvider === 'ollama' ? (
              <label className="ai-settings-field">
                <span className="ai-label">Ollama Endpoint</span>
                <input
                  className="input ai-input"
                  value={ollamaEndpoint}
                  onChange={(event) => onOllamaEndpointChange(event.target.value)}
                  placeholder="http://localhost:11434"
                  disabled={disabled}
                />
              </label>
            ) : null}

            <label className="ai-settings-field">
              <span className="ai-label">Model</span>
              <div className="ai-settings-model-row">
                <select
                  className="select ai-select"
                  value={selectedModelName}
                  onChange={(event) => onModelChange(event.target.value)}
                  disabled={disabled || models.length === 0}
                >
                  {models.length === 0 ? <option value="">No models available</option> : null}
                  {models.map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={onRefreshModels}
                  disabled={disabled || isLoadingModels}
                >
                  {isLoadingModels ? 'Loading...' : 'Refresh'}
                </button>
              </div>
            </label>

            <div className="ai-settings-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onTestConnection}
                disabled={disabled || isTestingConnection}
              >
                {isTestingConnection ? 'Testing...' : 'Test connection'}
              </button>
            </div>

            {activeProvider === 'groq' && hasProvidedGroqModels ? (
              <div className="ai-status">
                Using {providedGroqModelsCount} provided model{providedGroqModelsCount !== 1 ? 's' : ''}.
              </div>
            ) : null}
          </div>
        </details>

        <button
          type="button"
          className={`btn ${isBusy ? 'btn-danger' : 'btn-primary'} ai-send-btn`}
          onClick={isBusy ? onStop : onSend}
          disabled={isBusy ? false : disabled}
        >
          {isBusy ? 'Stop' : 'Send'}
        </button>
      </div>

      <div className="ai-prompt-footer">
        <span className="ai-prompt-meta">Enter sends. Shift+Enter adds a new line.</span>
        {statusMessage ? <span className="ai-composer-status">{statusMessage}</span> : null}
      </div>
    </div>
  );
}

export default PromptBox;
