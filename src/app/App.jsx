import { useMemo, useRef, useState, useEffect } from 'react';
import FileTabs from '../components/FileTabs';
import CodeEditor from '../components/CodeEditor';
import PreviewFrame from '../components/PreviewFrame';
import ConsolePanel from '../components/ConsolePanel';
import AiPanel from '../components/ai/AiPanel';
import useProjectStore from '../hooks/useProjectStore';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { buildSrcDoc } from '../lib/buildSrcDoc';
import { DEFAULT_PROJECT_FILES, FILE_ORDER, FILE_LANGUAGE } from '../lib/defaultProject';
import { IdeProvider } from './IdeContext';

const DEBOUNCE_MS = 300;

function App() {
  const { files, updateFile, autoRun, setAutoRun, resetProject } = useProjectStore();
  const [activeFile, setActiveFile] = useState(FILE_ORDER[0]);
  const [srcDoc, setSrcDoc] = useState(() => buildSrcDoc(files));
  const [consoleEntries, setConsoleEntries] = useState([]);
  const [lastRuntimeError, setLastRuntimeError] = useState('');
  const messageIdRef = useRef(1);
  const iframeRef = useRef(null);
  const editorRef = useRef(null);

  const debouncedFiles = useDebouncedValue(files, DEBOUNCE_MS);

  useEffect(() => {
    if (!autoRun) {
      return;
    }

    setSrcDoc(buildSrcDoc(debouncedFiles));
  }, [autoRun, debouncedFiles]);

  const pushConsoleEntry = (level, text) => {
    setConsoleEntries((prev) => [
      ...prev,
      {
        id: messageIdRef.current++,
        level,
        text
      }
    ]);
  };

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const payload = event.data;
      if (!payload || payload.source !== 'mini-ide-preview') {
        return;
      }

      if (payload.type === 'console') {
        const entryText = (payload.args || []).join(' ');
        pushConsoleEntry(payload.level, entryText);
      }

      if (payload.type === 'error') {
        const content = payload.stack ? `${payload.message}\n${payload.stack}` : payload.message;
        pushConsoleEntry('error', content);
        setLastRuntimeError(content);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleRun = () => {
    setLastRuntimeError('');
    setSrcDoc(buildSrcDoc(files));
  };

  const handleExportProject = () => {
    const blob = new Blob([JSON.stringify(files, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mini-ide-project.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleClearConsole = () => {
    setConsoleEntries([]);
    setLastRuntimeError('');
  };

  const handleResetProject = () => {
    resetProject();
    setActiveFile(FILE_ORDER[0]);
    setConsoleEntries([]);
    setLastRuntimeError('');
    setSrcDoc(buildSrcDoc(DEFAULT_PROJECT_FILES));
  };

  const handleEditorMount = (editor) => {
    editorRef.current = editor;
  };

  const getSelection = () => {
    const editor = editorRef.current;
    if (!editor) {
      return '';
    }

    const selection = editor.getSelection();
    const model = editor.getModel();

    if (!selection || !model || selection.isEmpty()) {
      return '';
    }

    return model.getValueInRange(selection);
  };

  const ideContextValue = useMemo(
    () => ({
      files,
      fileNames: FILE_ORDER,
      activeTab: activeFile,
      setActiveTab: setActiveFile,
      setFileContent: updateFile,
      getSelection,
      consoleLogs: consoleEntries,
      lastRuntimeError
    }),
    [files, activeFile, updateFile, consoleEntries, lastRuntimeError]
  );

  return (
    <IdeProvider value={ideContextValue}>
      <div className="app-shell">
        <header className="app-header">
          <div className="brand">no.studio</div>
          <div className="header-actions">
            <button type="button" className="btn btn-primary" onClick={handleRun}>
              Run
            </button>
            <label className="toggle toggle-inline" htmlFor="auto-run-toggle-header">
              <input
                id="auto-run-toggle-header"
                type="checkbox"
                checked={autoRun}
                onChange={(event) => setAutoRun(event.target.checked)}
              />
              <span>Auto-run</span>
            </label>
            <button type="button" className="btn btn-ghost" onClick={handleExportProject}>
              Export
            </button>
            <button type="button" className="btn btn-danger" onClick={handleResetProject}>
              Reset
            </button>
          </div>
        </header>

        <main className="workspace-grid">
          <section className="panel panel-editor">
            <div className="panel-header">
              <h2 className="panel-title">Editor</h2>
            </div>
            <div className="panel-body panel-body-editor">
              <FileTabs files={FILE_ORDER} activeFile={activeFile} onSelect={setActiveFile} />
              <div className="editor-surface">
                <CodeEditor
                  language={FILE_LANGUAGE[activeFile]}
                  path={activeFile}
                  value={files[activeFile]}
                  onChange={(value) => updateFile(activeFile, value)}
                  onMount={handleEditorMount}
                />
              </div>
            </div>
          </section>

          <section className="panel panel-preview">
            <div className="panel-header">
              <h2 className="panel-title">Preview</h2>
            </div>
            <div className="panel-body panel-body-preview">
              <div className="preview-surface">
                <PreviewFrame iframeRef={iframeRef} srcDoc={srcDoc} />
              </div>
              <div className="console-surface">
                <ConsolePanel entries={consoleEntries} onClear={handleClearConsole} />
              </div>
            </div>
          </section>

          <AiPanel />
        </main>
      </div>
    </IdeProvider>
  );
}

export default App;
