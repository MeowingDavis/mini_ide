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
  const [toolbarMessage, setToolbarMessage] = useState(
    'Use the top controls to show or hide windows, run the preview, export, or reset.'
  );
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth
  );
  const [columnWidths, setColumnWidths] = useState({
    editor: 38,
    preview: 34,
    ai: 28
  });
  const [previewPaneRatio, setPreviewPaneRatio] = useState(0.68);
  const [panelVisibility, setPanelVisibility] = useState({
    editor: true,
    preview: true,
    ai: true
  });
  const messageIdRef = useRef(1);
  const iframeRef = useRef(null);
  const editorRef = useRef(null);
  const workspaceRef = useRef(null);
  const previewPanelBodyRef = useRef(null);

  const debouncedFiles = useDebouncedValue(files, DEBOUNCE_MS);
  const isDesktopResizable = viewportWidth > 1260;

  useEffect(() => {
    if (!autoRun) {
      return;
    }

    setSrcDoc(buildSrcDoc(debouncedFiles));
  }, [autoRun, debouncedFiles]);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

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
    setToolbarMessage('Preview refreshed from current files.');
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
    setToolbarMessage('Project exported as mini-ide-project.json.');
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
    setToolbarMessage('Project reset to starter files.');
  };

  const withGlobalDrag = (cursor, onMove) => {
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = cursor;

    const handleMouseMove = (event) => {
      event.preventDefault();
      onMove(event);
    };

    const cleanup = () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
  };

  const startColumnResize = (boundary) => (event) => {
    if (!isDesktopResizable || !workspaceRef.current) {
      return;
    }

    event.preventDefault();

    const rect = workspaceRef.current.getBoundingClientRect();
    const styles = window.getComputedStyle(workspaceRef.current);
    const columnGap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
    const usableWidth = rect.width - columnGap * 2;
    if (usableWidth <= 0) {
      return;
    }

    const startX = event.clientX;
    const startSizes = { ...columnWidths };
    const startPx = {
      editor: (startSizes.editor / 100) * usableWidth,
      preview: (startSizes.preview / 100) * usableWidth,
      ai: (startSizes.ai / 100) * usableWidth
    };

    const minEditor = 320;
    const minPreview = 320;
    const minAi = 400;

    withGlobalDrag('col-resize', (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      let nextPx = { ...startPx };

      if (boundary === 'editor-preview') {
        nextPx.editor = Math.max(minEditor, Math.min(startPx.editor + delta, startPx.editor + startPx.preview - minPreview));
        nextPx.preview = startPx.editor + startPx.preview - nextPx.editor;
      } else if (boundary === 'editor-ai') {
        nextPx.editor = Math.max(minEditor, Math.min(startPx.editor + delta, startPx.editor + startPx.ai - minAi));
        nextPx.ai = startPx.editor + startPx.ai - nextPx.editor;
      } else {
        nextPx.preview = Math.max(minPreview, Math.min(startPx.preview + delta, startPx.preview + startPx.ai - minAi));
        nextPx.ai = startPx.preview + startPx.ai - nextPx.preview;
      }

      const total = nextPx.editor + nextPx.preview + nextPx.ai;
      setColumnWidths({
        editor: (nextPx.editor / total) * 100,
        preview: (nextPx.preview / total) * 100,
        ai: (nextPx.ai / total) * 100
      });
    });
  };

  const startPreviewConsoleResize = (event) => {
    if (!previewPanelBodyRef.current) {
      return;
    }

    event.preventDefault();

    const rect = previewPanelBodyRef.current.getBoundingClientRect();
    const handleSize = 8;
    const usableHeight = rect.height - handleSize;
    if (usableHeight <= 0) {
      return;
    }

    const startY = event.clientY;
    const startTop = previewPaneRatio * usableHeight;
    const minTop = 180;
    const minBottom = 140;

    withGlobalDrag('row-resize', (moveEvent) => {
      const delta = moveEvent.clientY - startY;
      const nextTop = Math.max(minTop, Math.min(startTop + delta, usableHeight - minBottom));
      setPreviewPaneRatio(nextTop / usableHeight);
    });
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

  const visiblePanels = ['editor', 'preview', 'ai'].filter((panel) => panelVisibility[panel]);
  const showEditor = panelVisibility.editor;
  const showPreview = panelVisibility.preview;
  const showAi = panelVisibility.ai;

  const togglePanelVisibility = (panel) => {
    let nextVisible = true;
    setPanelVisibility((prev) => {
      nextVisible = !prev[panel];
      return {
        ...prev,
        [panel]: nextVisible
      };
    });

    const panelLabel = panel === 'ai' ? 'Leaf chat' : panel.charAt(0).toUpperCase() + panel.slice(1);
    setToolbarMessage(`${panelLabel} ${nextVisible ? 'shown' : 'hidden'}.`);
  };

  const workspaceStyle = isDesktopResizable
    ? (() => {
        if (visiblePanels.length <= 1) {
          return {
            gridTemplateColumns: 'minmax(0, 1fr)'
          };
        }

        const minByPanel = {
          editor: 320,
          preview: 320,
          ai: 400
        };

        const total = visiblePanels.reduce((sum, panel) => sum + columnWidths[panel], 0) || 1;
        return {
          gridTemplateColumns: visiblePanels
            .map((panel) => `minmax(${minByPanel[panel]}px, ${(columnWidths[panel] / total) * 100}fr)`)
            .join(' ')
        };
      })()
    : undefined;

  const previewPaneStyle = {
    gridTemplateRows: `minmax(0, ${previewPaneRatio}fr) 8px minmax(140px, ${1 - previewPaneRatio}fr)`
  };

  return (
    <IdeProvider value={ideContextValue}>
      <div className="app-shell">
        <header className="app-header">
          <div className="brand-block">
            <div className="brand">no.studio</div>
            <div className="brand-subtitle">Build, preview, and chat in one workspace</div>
          </div>
          <div className="header-actions">
            <div className="toolbar-cluster">
              <span className="toolbar-cluster-label">Windows</span>
              <div className="window-toggle-group" role="toolbar" aria-label="Window visibility">
                <button
                  type="button"
                  className={`btn ${showEditor ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => togglePanelVisibility('editor')}
                  aria-pressed={showEditor}
                  title={`${showEditor ? 'Hide' : 'Show'} editor panel`}
                >
                  Editor
                </button>
                <button
                  type="button"
                  className={`btn ${showPreview ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => togglePanelVisibility('preview')}
                  aria-pressed={showPreview}
                  title={`${showPreview ? 'Hide' : 'Show'} preview panel`}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className={`btn ${showAi ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => togglePanelVisibility('ai')}
                  aria-pressed={showAi}
                  title={`${showAi ? 'Hide' : 'Show'} Leaf chat panel`}
                >
                  Leaf chat
                </button>
              </div>
            </div>
            <div className="toolbar-cluster">
              <span className="toolbar-cluster-label">Preview</span>
              <div className="toolbar-cluster-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleRun}
                  title="Rebuild and refresh the preview using the current editor files"
                >
                  Run
                </button>
                <label
                  className="toggle toggle-inline toolbar-toggle"
                  htmlFor="auto-run-toggle-header"
                  title="Automatically refresh preview after edits"
                >
                  <input
                    id="auto-run-toggle-header"
                    type="checkbox"
                    checked={autoRun}
                    onChange={(event) => {
                      setAutoRun(event.target.checked);
                      setToolbarMessage(
                        `Auto-run ${event.target.checked ? 'enabled' : 'disabled'} for preview updates.`
                      );
                    }}
                  />
                  <span>Auto-run</span>
                </label>
              </div>
            </div>
            <div className="toolbar-cluster">
              <span className="toolbar-cluster-label">Project</span>
              <div className="toolbar-cluster-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleExportProject}
                  title="Download the current project files as a JSON export"
                >
                  Export
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleResetProject}
                  title="Restore the default starter files and clear console output"
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="header-feedback" role="status" aria-live="polite">
              {toolbarMessage}
            </div>
          </div>
        </header>

        <main ref={workspaceRef} className="workspace-grid" style={workspaceStyle}>
          {showEditor ? (
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
            {isDesktopResizable && showPreview ? (
              <div
                className="panel-resizer panel-resizer-right"
                onMouseDown={startColumnResize('editor-preview')}
                aria-hidden="true"
              />
            ) : null}
            {isDesktopResizable && !showPreview && showAi ? (
              <div
                className="panel-resizer panel-resizer-right"
                onMouseDown={startColumnResize('editor-ai')}
                aria-hidden="true"
              />
            ) : null}
          </section>
          ) : null}

          {showPreview ? (
          <section className="panel panel-preview">
            <div className="panel-header">
              <h2 className="panel-title">Preview</h2>
            </div>
            <div ref={previewPanelBodyRef} className="panel-body panel-body-preview" style={previewPaneStyle}>
              <div className="preview-surface">
                <PreviewFrame iframeRef={iframeRef} srcDoc={srcDoc} />
              </div>
              <div
                className="panel-resizer-inline panel-resizer-horizontal"
                onMouseDown={startPreviewConsoleResize}
                aria-hidden="true"
              />
              <div className="console-surface">
                <ConsolePanel entries={consoleEntries} onClear={handleClearConsole} />
              </div>
            </div>
            {isDesktopResizable && showAi ? (
              <div
                className="panel-resizer panel-resizer-right panel-resizer-desktop-only"
                onMouseDown={startColumnResize('preview-ai')}
                aria-hidden="true"
              />
            ) : null}
          </section>
          ) : null}

          {showAi ? <AiPanel /> : null}

          {visiblePanels.length === 0 ? (
            <section className="panel panel-empty-state">
              <div className="panel-body">
                <div className="empty-state-note">All windows are minimized. Use the top bar to restore a panel.</div>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </IdeProvider>
  );
}

export default App;
