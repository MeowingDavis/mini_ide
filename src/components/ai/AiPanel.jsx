import { useEffect, useMemo, useRef, useState } from 'react';
import PromptBox from './PromptBox';
import ResponseView from './ResponseView';
import EditPlanView from './EditPlanView';
import useAiSettings from '../../hooks/useAiSettings';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useUploadedDocs from '../../hooks/useUploadedDocs';
import { buildAiPrompt } from '../../lib/buildAiPrompt';
import { tryExtractEdits } from '../../lib/aiEdits';
import { chat, listModels, testConnection } from '../../lib/ollamaClient';
import { useIdeContext } from '../../app/IdeContext';

const SYSTEM_PROMPT =
  'You are Leaf chat, an expert frontend coding assistant. Be concise. Default to short answers. When a user asks for a code change, keep the visible reply brief and practical. Do not add filler like "let me know what you prefer."';
const CHAT_MODE_EDIT_PROMPT =
  'In chat mode: answer concisely. When the user asks for code changes, include a JSON block with shape {"summary":"short","edits":[{"file":"index.html|styles.css|main.js","content":"full file text"}]} so the UI can offer manual Apply buttons. If you include edits JSON, do not repeat the full code outside the JSON block. Keep visible prose to a short summary (1-2 sentences max). Do not ask for permission to manually edit vs JSON unless the user asks.';

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
  const assistantMode = 'chat';
  const { uploadedDocs, addFiles, removeDoc } = useUploadedDocs();
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
  const [selectedAction, setSelectedAction] = useState('ask');
  const [response, setResponse] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [uiMessages, setUiMessages] = useState([]);
  const [pendingEdits, setPendingEdits] = useState([]);
  const [editSummary, setEditSummary] = useState('');
  const [panelError, setPanelError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const activeRequestRef = useRef(null);

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

  useEffect(
    () => () => {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
    },
    []
  );

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
    const userDisplayMessage =
      action === 'ask'
        ? userQuestion
        : [actionLabel(action), userQuestion].filter(Boolean).join('\n\n');

    if (!question && action === 'ask') {
      setPanelError('Enter a prompt before asking the assistant.');
      return;
    }

    const selection = (getSelection && getSelection()) || '';

    const userContent = buildAiPrompt({
      action,
      question,
      provider: activeProvider,
      mode: assistantMode,
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
      { role: 'system', content: CHAT_MODE_EDIT_PROMPT },
      ...chatHistory,
      { role: 'user', content: userContent }
    ];

    setPanelError('');
    setStatusMessage(`${actionLabel(action)} request sent.`);
    setIsAsking(true);
    setResponse('');
    setPendingEdits([]);
    setEditSummary('');
    setUiMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: userDisplayMessage || 'Ask about the current code'
      }
    ]);
    setPrompt('');
    const abortController = new AbortController();
    activeRequestRef.current = abortController;
    let streamedText = '';

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
                streamedText = aggregated;
                setResponse(aggregated);
              },
              signal: abortController.signal
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
              stream: false,
              signal: abortController.signal
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
            stream: false,
            signal: abortController.signal
          }
        );
        setResponse(assistantText);
      }

      const parsed = tryExtractEdits(assistantText, fileNames);
      let visibleAssistantText = assistantText || 'No response returned.';

      if (parsed.edits.length > 0) {
        visibleAssistantText =
          parsed.summary ||
          `Suggested ${parsed.edits.length} file edit${parsed.edits.length > 1 ? 's' : ''}. Review and apply below.`;

        setPendingEdits(parsed.edits);
        setEditSummary(parsed.summary || 'Suggested edits ready to review.');
        setResponse(visibleAssistantText);
        setStatusMessage(
          `Generated ${parsed.edits.length} suggested edit${parsed.edits.length > 1 ? 's' : ''}.`
        );
      } else {
        setPendingEdits([]);
        setEditSummary('');
        setResponse(assistantText || 'No response returned.');
      }

      const nextHistory = [
        ...chatHistory,
        { role: 'user', content: userContent },
        { role: 'assistant', content: assistantText || 'No response returned.' }
      ].slice(-16);

      setChatHistory(nextHistory);
      setUiMessages((prev) =>
        [
          ...prev,
          {
            role: 'assistant',
            content: visibleAssistantText
          }
        ].slice(-24)
      );
    } catch (error) {
      if (error?.name === 'AbortError' || abortController.signal.aborted) {
        const partialText = (streamedText || '').trim();

        if (partialText) {
          setUiMessages((prev) =>
            [
              ...prev,
              {
                role: 'assistant',
                content: partialText
              }
            ].slice(-24)
          );
          setChatHistory((prev) =>
            [
              ...prev,
              { role: 'user', content: userContent },
              { role: 'assistant', content: partialText }
            ].slice(-16)
          );
        }

        setStatusMessage('Response stopped.');
        return;
      }

      setPanelError(error.message || 'AI request failed.');
    } finally {
      if (activeRequestRef.current === abortController) {
        activeRequestRef.current = null;
      }
      setIsAsking(false);
    }
  };

  const handleStopResponse = () => {
    if (!activeRequestRef.current) {
      return;
    }

    setStatusMessage('Stopping response...');
    activeRequestRef.current.abort();
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
        <h2 className="panel-title">Leaf chat</h2>
      </div>

      <div className="panel-body ai-panel-body">
        <ResponseView
          messages={uiMessages}
          response={response}
          isBusy={isAsking}
          onCopy={handleCopyResponse}
          mode={assistantMode}
        />

        <EditPlanView
          visible={pendingEdits.length > 0}
          title="Suggested Edits"
          planSummary={editSummary}
          edits={pendingEdits}
          onApplyAll={applyAllEdits}
          onApplySingle={applySingleEdit}
          disabled={isAsking}
        />

        {panelError ? <div className="ai-error">{panelError}</div> : null}

        <PromptBox
          prompt={prompt}
          onPromptChange={setPrompt}
          onSend={() => handleAsk(selectedAction, prompt)}
          onStop={handleStopResponse}
          disabled={isAsking}
          isBusy={isAsking}
          activeProvider={activeProvider}
          onProviderChange={handleProviderChange}
          ollamaEndpoint={settings.ollamaEndpoint}
          onOllamaEndpointChange={(value) => setSetting('ollamaEndpoint', value)}
          selectedModelName={settings.selectedModel}
          models={models}
          onModelChange={(value) => setSetting('selectedModel', value)}
          onRefreshModels={handleRefreshModels}
          isLoadingModels={isLoadingModels}
          onTestConnection={handleTestConnection}
          isTestingConnection={isTestingConnection}
          statusMessage={statusMessage}
          selectedAction={selectedAction}
          onActionChange={setSelectedAction}
          uploadedDocs={uploadedDocs}
          includeCode={settings.includeCode}
          includeSelection={settings.includeSelection}
          includeUploads={settings.includeUploads}
          streaming={settings.streaming}
          onSettingChange={setSetting}
          hasProvidedGroqModels={hasProvidedGroqModels}
          providedGroqModelsCount={providedGroqModels.length}
          onIncludeUploadsChange={(value) => setSetting('includeUploads', value)}
          onUpload={handleUploadFiles}
          onRemoveUpload={removeDoc}
          isUploading={isUploading}
        />
      </div>
    </aside>
  );
}

export default AiPanel;
