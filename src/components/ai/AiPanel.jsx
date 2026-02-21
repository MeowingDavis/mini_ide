import { useEffect, useMemo, useState } from 'react';
import AssistantModeSwitch from './AssistantModeSwitch';
import EndpointInput from './EndpointInput';
import ModelPicker from './ModelPicker';
import ToggleRow from './ToggleRow';
import PromptBox from './PromptBox';
import ResponseView from './ResponseView';
import ContextFilesUpload from './ContextFilesUpload';
import EditPlanView from './EditPlanView';
import useAiSettings from '../../hooks/useAiSettings';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useUploadedDocs from '../../hooks/useUploadedDocs';
import { buildAiPrompt } from '../../lib/buildAiPrompt';
import { parseEditResponse, tryExtractEdits } from '../../lib/aiEdits';
import { chat, listModels, testConnection } from '../../lib/ollamaClient';
import { useIdeContext } from '../../app/IdeContext';

const SYSTEM_PROMPT =
  'You are an expert frontend assistant. Give practical, minimal patches and explain changes clearly.';
const EDIT_MODE_SYSTEM_PROMPT =
  'You are in edit mode. Return JSON only with shape: {"summary":"short", "edits":[{"file":"index.html|styles.css|main.js","content":"full file text"}]}.';
const CHAT_MODE_EDIT_PROMPT =
  'In chat mode: answer normally, but when the user asks for code changes include a JSON block with shape {"summary":"short","edits":[{"file":"index.html|styles.css|main.js","content":"full file text"}]} so the UI can offer Apply buttons.';

const ACTION_INSTRUCTIONS = {
  ask: '',
  explain_selection:
    'Explain the selected code. Focus on what it does, potential issues, and how to improve it.',
  refactor_selection:
    'Refactor the selected code for readability and maintainability. Provide the final code block.',
  fix_console_error:
    'Diagnose the runtime issue from console output and propose a concrete fix with updated code.'
};

function actionLabel(action) {
  if (action === 'explain_selection') return 'Explain selection';
  if (action === 'refactor_selection') return 'Refactor selection';
  if (action === 'fix_console_error') return 'Fix console error';
  return 'Ask';
}

function providerLabel(provider) {
  return provider === 'groq' ? 'Groq' : 'Ollama';
}

function parseModelList(value) {
  return String(value || '')
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function AiPanel() {
  const { settings, setSetting } = useAiSettings();
  const { uploadedDocs, addFiles, removeDoc, clearDocs } = useUploadedDocs();
  const activeProvider = settings.provider === 'groq' ? 'groq' : 'ollama';
  const debouncedOllamaEndpoint = useDebouncedValue(settings.ollamaEndpoint, 350);
  const providedGroqModels = useMemo(
    () => parseModelList(import.meta.env.VITE_GROQ_MODELS || import.meta.env.VITE_ONLINE_MODELS),
    []
  );
  const hasProvidedGroqModels = providedGroqModels.length > 0;
  const {
    files,
    fileNames,
    activeTab,
    setActiveTab,
    setFileContent,
    getSelection,
    consoleLogs,
    lastRuntimeError
  } = useIdeContext();

  const [models, setModels] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [pendingEdits, setPendingEdits] = useState([]);
  const [editSummary, setEditSummary] = useState('');
  const [panelError, setPanelError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    setPendingEdits([]);
    setEditSummary('');
  }, [settings.mode]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (activeProvider === 'groq' && hasProvidedGroqModels) {
        setModels(providedGroqModels);
        setPanelError('');

        if (
          providedGroqModels.length > 0 &&
          !providedGroqModels.includes(settings.selectedModel)
        ) {
          setSetting('selectedModel', providedGroqModels[0]);
        }

        return;
      }

      if (activeProvider === 'ollama' && !debouncedOllamaEndpoint.trim()) {
        setModels([]);
        setPanelError('Enter an Ollama endpoint.');
        return;
      }

      setIsLoadingModels(true);
      setPanelError('');

      try {
        const names = await listModels(activeProvider, debouncedOllamaEndpoint);
        if (cancelled) {
          return;
        }

        setModels(names);
        if (names.length === 0) {
          setPanelError(
            activeProvider === 'groq'
              ? 'Connected, but no online models were returned.'
              : 'Connected, but no installed models were found. Run: ollama pull llama3.2'
          );
        }

        if (names.length > 0 && !names.includes(settings.selectedModel)) {
          setSetting('selectedModel', names[0]);
        }
      } catch (error) {
        if (!cancelled) {
          setModels([]);
          setPanelError(error.message || `Failed to load ${providerLabel(activeProvider)} models.`);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingModels(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [
    activeProvider,
    debouncedOllamaEndpoint,
    hasProvidedGroqModels,
    providedGroqModels,
    setSetting,
    settings.selectedModel
  ]);

  const latestConsoleContext = useMemo(() => {
    const recent = consoleLogs.slice(-5).map((entry) => `[${entry.level}] ${entry.text}`);
    return recent.join('\n');
  }, [consoleLogs]);

  const handleRefreshModels = async () => {
    if (activeProvider === 'groq' && hasProvidedGroqModels) {
      setModels(providedGroqModels);
      if (providedGroqModels.length > 0 && !providedGroqModels.includes(settings.selectedModel)) {
        setSetting('selectedModel', providedGroqModels[0]);
      }
      setPanelError('');
      setStatusMessage(
        `Loaded ${providedGroqModels.length} provided online model${
          providedGroqModels.length !== 1 ? 's' : ''
        }.`
      );
      return;
    }

    if (activeProvider === 'ollama' && !settings.ollamaEndpoint.trim()) {
      setPanelError('Enter an Ollama endpoint.');
      return;
    }

    setPanelError('');
    setStatusMessage('Refreshing models...');
    setIsLoadingModels(true);

    try {
      const names = await listModels(activeProvider, settings.ollamaEndpoint);
      setModels(names);
      if (names.length === 0) {
        setPanelError(
          activeProvider === 'groq'
            ? 'No online models were returned by the server.'
            : 'No installed models found. Pull one with: ollama pull llama3.2'
        );
      } else {
        setStatusMessage(`Loaded ${names.length} model${names.length > 1 ? 's' : ''}.`);
      }

      if (names.length > 0 && !names.includes(settings.selectedModel)) {
        setSetting('selectedModel', names[0]);
      }
    } catch (error) {
      setPanelError(error.message || 'Failed to refresh models.');
      setStatusMessage('');
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleTestConnection = async () => {
    if (activeProvider === 'groq' && hasProvidedGroqModels) {
      setStatusMessage(
        `Online provider is configured with ${providedGroqModels.length} provided model${
          providedGroqModels.length !== 1 ? 's' : ''
        }.`
      );
      setPanelError('');
      return;
    }

    if (activeProvider === 'ollama' && !settings.ollamaEndpoint.trim()) {
      setPanelError('Enter an Ollama endpoint.');
      return;
    }

    setIsTestingConnection(true);
    setPanelError('');
    setStatusMessage('');

    const result = await testConnection(activeProvider, settings.ollamaEndpoint);

    if (!result.ok) {
      setPanelError(result.error || 'Connection failed.');
      setStatusMessage('');
      setIsTestingConnection(false);
      return;
    }

    setModels(result.models);
    if (result.models.length > 0 && !result.models.includes(settings.selectedModel)) {
      setSetting('selectedModel', result.models[0]);
    }

    if (result.models.length === 0) {
      setPanelError(
        activeProvider === 'groq'
          ? 'Connected, but no online models were returned.'
          : 'Connected, but no installed models were found. Run: ollama pull llama3.2'
      );
    }

    setStatusMessage(
      `${providerLabel(activeProvider)} connected. ${result.models.length} model${
        result.models.length !== 1 ? 's' : ''
      } found.`
    );
    setIsTestingConnection(false);
  };

  const applySingleEdit = (edit) => {
    setFileContent(edit.file, edit.content);
    setActiveTab(edit.file);
    setPendingEdits((prev) => prev.filter((candidate) => candidate.file !== edit.file));
    setStatusMessage(`Applied edit to ${edit.file}.`);
  };

  const applyAllEdits = () => {
    if (pendingEdits.length === 0) {
      setPanelError('No valid edits to apply.');
      return;
    }

    pendingEdits.forEach((edit) => {
      setFileContent(edit.file, edit.content);
    });

    setActiveTab(pendingEdits[0].file);
    setPendingEdits([]);
    setStatusMessage(`Applied ${pendingEdits.length} edit${pendingEdits.length > 1 ? 's' : ''}.`);
  };

  const handleUploadFiles = async (event) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) {
      return;
    }

    setPanelError('');
    setIsUploading(true);

    try {
      const count = await addFiles(fileList);
      setStatusMessage(`Uploaded ${count} file${count > 1 ? 's' : ''}.`);
    } catch {
      setPanelError('Failed to read uploaded files.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleAsk = async (action, rawQuestion) => {
    if (isAsking) {
      return;
    }

    if (!settings.selectedModel) {
      setPanelError('Choose a model before sending a request.');
      return;
    }

    const actionInstruction = ACTION_INSTRUCTIONS[action] || '';
    const userQuestion = (rawQuestion || '').trim();
    const question = [actionInstruction, userQuestion].filter(Boolean).join('\n\n');

    if (!question && action === 'ask') {
      setPanelError('Enter a prompt before asking the assistant.');
      return;
    }

    const selection = (getSelection && getSelection()) || '';

    const userContent = buildAiPrompt({
      action,
      question,
      provider: activeProvider,
      mode: settings.mode,
      model: settings.selectedModel,
      activeTab,
      selection,
      files,
      includeCode: settings.includeCode,
      includeSelection: settings.includeSelection,
      includeUploads: settings.includeUploads,
      uploadedDocs,
      consoleLogs,
      lastRuntimeError
    });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(settings.mode === 'edit'
        ? [{ role: 'system', content: EDIT_MODE_SYSTEM_PROMPT }]
        : [{ role: 'system', content: CHAT_MODE_EDIT_PROMPT }]),
      ...chatHistory,
      { role: 'user', content: userContent }
    ];

    setPanelError('');
    setStatusMessage(`${actionLabel(action)} request sent.`);
    setIsAsking(true);
    setResponse('');
    setPendingEdits([]);
    setEditSummary('');

    try {
      let assistantText = '';

      if (settings.streaming) {
        try {
          assistantText = await chat(
            activeProvider,
            settings.ollamaEndpoint,
            '',
            settings.selectedModel,
            messages,
            {
              stream: true,
              onToken: (_, aggregated) => {
                setResponse(aggregated);
              }
            }
          );
        } catch (streamError) {
          assistantText = await chat(
            activeProvider,
            settings.ollamaEndpoint,
            '',
            settings.selectedModel,
            messages,
            {
              stream: false
            }
          );
          setResponse(assistantText);
          setStatusMessage(
            `Streaming fallback used: ${streamError.message || 'Switched to non-streaming.'}`
          );
        }
      } else {
        assistantText = await chat(
          activeProvider,
          settings.ollamaEndpoint,
          '',
          settings.selectedModel,
          messages,
          {
            stream: false
          }
        );
        setResponse(assistantText);
      }

      if (settings.mode === 'edit') {
        const parsed = parseEditResponse(assistantText, fileNames);
        if (parsed.error) {
          setPanelError(parsed.error);
        } else {
          parsed.edits.forEach((edit) => {
            setFileContent(edit.file, edit.content);
          });

          setActiveTab(parsed.edits[0].file);
          setPendingEdits([]);
          setEditSummary(parsed.summary);
          if (parsed.summary) {
            setResponse(parsed.summary);
          }
          setStatusMessage(
            `Applied ${parsed.edits.length} edit${parsed.edits.length > 1 ? 's' : ''}.`
          );
        }
      } else {
        const parsed = tryExtractEdits(assistantText, fileNames);
        if (parsed.edits.length > 0) {
          setPendingEdits(parsed.edits);
          setEditSummary(parsed.summary || 'Proposed edits ready to apply.');
          setStatusMessage(
            `Generated ${parsed.edits.length} proposed edit${parsed.edits.length > 1 ? 's' : ''}.`
          );
        } else {
          setPendingEdits([]);
          setEditSummary('');
        }
      }

      const nextHistory = [
        ...chatHistory,
        { role: 'user', content: userContent },
        { role: 'assistant', content: assistantText || 'No response returned.' }
      ].slice(-16);

      setChatHistory(nextHistory);
      if (action === 'ask') {
        setPrompt('');
      }
    } catch (error) {
      setPanelError(error.message || 'AI request failed.');
    } finally {
      setIsAsking(false);
    }
  };

  const handleCopyResponse = async () => {
    if (!response) {
      return;
    }

    try {
      await navigator.clipboard.writeText(response);
      setStatusMessage('Response copied to clipboard.');
    } catch {
      setPanelError('Clipboard copy failed.');
    }
  };

  const handleProviderChange = (nextProvider) => {
    if (nextProvider === activeProvider) {
      return;
    }

    setSetting('provider', nextProvider);
    setSetting('selectedModel', '');
    setPanelError('');
    setStatusMessage('');
    setModels([]);
  };

  return (
    <aside className="panel panel-ai">
      <div className="panel-header">
        <h2 className="panel-title">AI Assistant</h2>
      </div>

      <div className="panel-body ai-panel-body">
        <AssistantModeSwitch
          mode={settings.mode}
          onChange={(mode) => setSetting('mode', mode)}
          disabled={isAsking}
        />

        <div className="ai-section">
          <div className="ai-label">Provider</div>
          <div className="ai-mode-switch ai-provider-switch">
            <button
              type="button"
              className={`btn ${activeProvider === 'ollama' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => handleProviderChange('ollama')}
              disabled={isAsking}
            >
              Local Ollama
            </button>
            <button
              type="button"
              className={`btn ${activeProvider === 'groq' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => handleProviderChange('groq')}
              disabled={isAsking}
            >
              Online Groq
            </button>
          </div>

          {activeProvider === 'groq' ? (
            <>
              {hasProvidedGroqModels ? (
                <div className="ai-status">
                  Using {providedGroqModels.length} provided online model
                  {providedGroqModels.length !== 1 ? 's' : ''} from `.env`.
                </div>
              ) : null}
              <div className="ai-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                >
                  {isTestingConnection ? 'Testing...' : 'Test online connection'}
                </button>
              </div>
              {statusMessage ? <div className="ai-status">{statusMessage}</div> : null}
            </>
          ) : null}
        </div>

        {activeProvider === 'ollama' ? (
          <EndpointInput
            label="Ollama Endpoint"
            endpoint={settings.ollamaEndpoint}
            placeholder="http://localhost:11434"
            onChange={(value) => setSetting('ollamaEndpoint', value)}
            onTest={handleTestConnection}
            isTesting={isTestingConnection}
            status={statusMessage}
            testLabel="Test connection"
          />
        ) : null}

        <ModelPicker
          models={models}
          selectedModel={settings.selectedModel}
          onChange={(value) => setSetting('selectedModel', value)}
          onRefresh={handleRefreshModels}
          isLoading={isLoadingModels}
          showRefresh={!(activeProvider === 'groq' && hasProvidedGroqModels)}
        />

        <ToggleRow
          includeCode={settings.includeCode}
          includeSelection={settings.includeSelection}
          streaming={settings.streaming}
          onChange={setSetting}
        />

        <ContextFilesUpload
          uploadedDocs={uploadedDocs}
          includeUploads={settings.includeUploads}
          onIncludeUploadsChange={(value) => setSetting('includeUploads', value)}
          onUpload={handleUploadFiles}
          onRemove={removeDoc}
          onClearAll={clearDocs}
          isUploading={isUploading}
        />

        <PromptBox
          prompt={prompt}
          onPromptChange={setPrompt}
          onAsk={() => handleAsk('ask', prompt)}
          onAction={(action) => handleAsk(action, prompt)}
          disabled={isAsking}
          mode={settings.mode}
        />

        <ResponseView
          response={response}
          isBusy={isAsking}
          onCopy={handleCopyResponse}
          mode={settings.mode}
        />

        <EditPlanView
          visible={settings.mode === 'chat' && pendingEdits.length > 0}
          title="Chat Proposed Edits"
          planSummary={editSummary}
          edits={pendingEdits}
          onApplyAll={applyAllEdits}
          onApplySingle={applySingleEdit}
          disabled={isAsking}
        />

        {lastRuntimeError ? (
          <div className="ai-runtime-context">
            <span className="ai-label">Last Runtime Error</span>
            <pre>{lastRuntimeError}</pre>
          </div>
        ) : null}

        {latestConsoleContext ? (
          <div className="ai-runtime-context">
            <span className="ai-label">Recent Console</span>
            <pre>{latestConsoleContext}</pre>
          </div>
        ) : null}

        {panelError ? <div className="ai-error">{panelError}</div> : null}
      </div>
    </aside>
  );
}

export default AiPanel;
