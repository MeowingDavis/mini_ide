import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import FileTabs from '../components/FileTabs';
import FileExplorer from '../components/FileExplorer';
import UiIcon from '../components/UiIcon';
import CodeEditor from '../components/CodeEditor';
import PreviewFrame from '../components/PreviewFrame';
import ConsolePanel from '../components/ConsolePanel';
import AiPanel from '../components/ai/AiPanel';
import useProjectStore from '../hooks/useProjectStore';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { buildSrcDoc } from '../lib/buildSrcDoc';
import {
  DEFAULT_PROJECT_FILES,
  getDefaultActiveFile,
  getSortedFileNames,
  getStarterContentForFile,
  inferLanguageFromFileName
} from '../lib/defaultProject';
import { IdeProvider } from './IdeContext';

const DEBOUNCE_MS = 300;

function App() {
  const {
    files,
    folders,
    updateFile,
    createFile,
    deleteFile,
    createFolder,
    renameFile,
    moveFile,
    renameFolder,
    moveFolder,
    deleteFolder,
    autoRun,
    setAutoRun,
    resetProject
  } = useProjectStore();
  const [activeFile, setActiveFile] = useState(() => getDefaultActiveFile(DEFAULT_PROJECT_FILES));
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
    ai: 28,
    console: 28
  });
  const [previewPaneRatio, setPreviewPaneRatio] = useState(0.68);
  const [showConsole, setShowConsole] = useState(true);
  const [isPreviewPopoutOpen, setIsPreviewPopoutOpen] = useState(false);
  const [editorExplorerWidth, setEditorExplorerWidth] = useState(240);
  const [showExplorer, setShowExplorer] = useState(true);
  const [panelVisibility, setPanelVisibility] = useState({
    editor: true,
    preview: false,
    ai: false
  });
  const messageIdRef = useRef(1);
  const iframeRef = useRef(null);
  const previewPopoutRef = useRef(null);
  const editorRef = useRef(null);
  const workspaceRef = useRef(null);
  const previewPanelBodyRef = useRef(null);
  const editorWorkspaceRef = useRef(null);

  const debouncedFiles = useDebouncedValue(files, DEBOUNCE_MS);
  const isDesktopResizable = viewportWidth > 1260;
  const fileNames = useMemo(() => getSortedFileNames(files), [files]);

  const normalizePathInput = (value) =>
    String(value || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '');

  const getParentFolderPath = (path) => {
    const normalized = normalizePathInput(path);
    const index = normalized.lastIndexOf('/');
    return index > 0 ? normalized.slice(0, index) : '';
  };

  const createFolderChain = (folderPath) => {
    const normalized = normalizePathInput(folderPath);
    if (!normalized) {
      return;
    }

    const parts = normalized.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      createFolder(current);
    }
  };

  const folderHasPathConflict = (sourcePrefix, targetPrefix) => {
    if (!targetPrefix || sourcePrefix === targetPrefix || targetPrefix.startsWith(`${sourcePrefix}/`)) {
      return true;
    }

    const targetFileCollision = Object.keys(files).some((filePath) => {
      if (!(filePath === targetPrefix || filePath.startsWith(`${targetPrefix}/`))) {
        return false;
      }
      return !(filePath === sourcePrefix || filePath.startsWith(`${sourcePrefix}/`));
    });

    if (targetFileCollision) {
      return true;
    }

    return folders.some((folderPath) => {
      if (!(folderPath === targetPrefix || folderPath.startsWith(`${targetPrefix}/`))) {
        return false;
      }
      return !(folderPath === sourcePrefix || folderPath.startsWith(`${sourcePrefix}/`));
    });
  };

  useEffect(() => {
    if (!activeFile || !Object.prototype.hasOwnProperty.call(files, activeFile)) {
      setActiveFile(getDefaultActiveFile(files));
    }
  }, [activeFile, files]);

  useEffect(() => {
    if (!autoRun) {
      return;
    }

    setSrcDoc(buildSrcDoc(debouncedFiles));
  }, [autoRun, debouncedFiles]);

  const writePreviewToPopout = (nextSrcDoc) => {
    const popout = previewPopoutRef.current;
    if (!popout || popout.closed) {
      if (popout?.closed) {
        previewPopoutRef.current = null;
        setIsPreviewPopoutOpen(false);
      }
      return false;
    }

    popout.document.open();
    popout.document.write(nextSrcDoc);
    popout.document.close();
    setIsPreviewPopoutOpen(true);
    return true;
  };

  useEffect(() => {
    writePreviewToPopout(srcDoc);
  }, [srcDoc]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const popout = previewPopoutRef.current;
      const isOpen = Boolean(popout && !popout.closed);
      setIsPreviewPopoutOpen((prev) => (prev === isOpen ? prev : isOpen));
      if (!isOpen && previewPopoutRef.current?.closed) {
        previewPopoutRef.current = null;
      }
    }, 800);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

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
        if (event.source !== previewPopoutRef.current) {
          return;
        }
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

  const handlePopoutPreview = () => {
    let popout = previewPopoutRef.current;
    const hadOpenPopout = Boolean(popout && !popout.closed);

    if (!popout || popout.closed) {
      popout = window.open('', 'mini-ide-preview-popout', 'popup=yes,width=1100,height=760');

      if (!popout) {
        setToolbarMessage('Preview pop-out was blocked by the browser.');
        return;
      }

      previewPopoutRef.current = popout;
      setIsPreviewPopoutOpen(true);
      popout.addEventListener('beforeunload', () => {
        if (previewPopoutRef.current === popout) {
          previewPopoutRef.current = null;
          setIsPreviewPopoutOpen(false);
        }
      });
    }

    writePreviewToPopout(srcDoc);
    popout.focus();
    setPanelVisibility((prev) => ({
      ...prev,
      preview: false
    }));
    setToolbarMessage(hadOpenPopout ? 'Preview window focused.' : 'Preview opened in a separate window.');
  };

  const handleDockPreview = () => {
    const popout = previewPopoutRef.current;
    if (popout && !popout.closed) {
      popout.close();
    }
    previewPopoutRef.current = null;
    setIsPreviewPopoutOpen(false);
    setPanelVisibility((prev) => ({
      ...prev,
      preview: true
    }));
    setToolbarMessage('Preview docked back into the workspace.');
  };

  const handleFocusPreviewPopout = () => {
    const popout = previewPopoutRef.current;
    if (!popout || popout.closed) {
      setIsPreviewPopoutOpen(false);
      setToolbarMessage('Preview window is not open.');
      return;
    }
    popout.focus();
    setToolbarMessage('Preview window focused.');
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
    setActiveFile(getDefaultActiveFile(DEFAULT_PROJECT_FILES));
    setConsoleEntries([]);
    setLastRuntimeError('');
    setSrcDoc(buildSrcDoc(DEFAULT_PROJECT_FILES));
    setToolbarMessage('Project reset to starter files.');
  };

  const handleCreateFile = (initialPath = '') => {
    const rawName = window.prompt(
      'New file name (example: app.js, styles/theme.css, data.json)',
      initialPath || ''
    );
    const fileName = normalizePathInput(rawName);

    if (!fileName) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(files, fileName)) {
      setToolbarMessage(`File already exists: ${fileName}`);
      setActiveFile(fileName);
      return;
    }

    createFolderChain(getParentFolderPath(fileName));
    createFile(fileName, getStarterContentForFile(fileName));
    setActiveFile(fileName);
    setToolbarMessage(`Created ${fileName}.`);
  };

  const handleCreateFolder = (initialPath = '') => {
    const rawName = window.prompt(
      'New folder path (example: src, src/components, assets/css)',
      initialPath || ''
    );
    const folderPath = normalizePathInput(rawName);

    if (!folderPath) {
      return;
    }

    createFolderChain(folderPath);
    createFolder(folderPath);
    setToolbarMessage(`Created folder ${folderPath}.`);
  };

  const handleDeleteActiveFile = () => {
    if (!activeFile) {
      return;
    }

    if (fileNames.length <= 1) {
      setToolbarMessage('At least one file must remain in the project.');
      return;
    }

    const confirmed = window.confirm(`Delete "${activeFile}"?`);
    if (!confirmed) {
      return;
    }

    deleteFile(activeFile);
    setToolbarMessage(`Deleted ${activeFile}.`);
  };

  const handleDeleteFileByPath = (filePath) => {
    if (!filePath || !Object.prototype.hasOwnProperty.call(files, filePath)) {
      return;
    }

    if (fileNames.length <= 1) {
      setToolbarMessage('At least one file must remain in the project.');
      return;
    }

    if (!window.confirm(`Delete "${filePath}"?`)) {
      return;
    }

    deleteFile(filePath);
    setToolbarMessage(`Deleted ${filePath}.`);
  };

  const handleRenameFile = (filePath) => {
    if (!filePath || !Object.prototype.hasOwnProperty.call(files, filePath)) {
      return;
    }

    const rawNext = window.prompt('Rename file', filePath);
    const nextPath = normalizePathInput(rawNext);
    if (!nextPath || nextPath === filePath) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(files, nextPath)) {
      setToolbarMessage(`Cannot rename. File exists: ${nextPath}`);
      return;
    }

    createFolderChain(getParentFolderPath(nextPath));
    renameFile(filePath, nextPath);
    if (activeFile === filePath) {
      setActiveFile(nextPath);
    }
    setToolbarMessage(`Renamed ${filePath} to ${nextPath}.`);
  };

  const handleRenameActiveFile = () => {
    if (!activeFile) {
      return;
    }
    handleRenameFile(activeFile);
  };

  const handleMoveFile = (filePath, targetFolderPath = '') => {
    if (!filePath || !Object.prototype.hasOwnProperty.call(files, filePath)) {
      return;
    }

    const fileBase = filePath.split('/').pop();
    const folderPath = normalizePathInput(targetFolderPath);
    const nextPath = folderPath ? `${folderPath}/${fileBase}` : fileBase;

    if (nextPath === filePath) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(files, nextPath)) {
      setToolbarMessage(`Cannot move ${fileBase}. File exists at ${nextPath}.`);
      return;
    }

    createFolderChain(folderPath);
    moveFile(filePath, nextPath);
    if (activeFile === filePath) {
      setActiveFile(nextPath);
    }
    setToolbarMessage(`Moved ${filePath} to ${folderPath || '(root)'}.`);
  };

  const handleRenameFolder = (folderPath) => {
    if (!folderPath) {
      return;
    }

    const rawNext = window.prompt('Rename folder', folderPath);
    const nextPath = normalizePathInput(rawNext);
    if (!nextPath || nextPath === folderPath) {
      return;
    }

    if (folderHasPathConflict(folderPath, nextPath)) {
      setToolbarMessage(`Cannot rename folder. Path conflict at ${nextPath}.`);
      return;
    }

    createFolderChain(getParentFolderPath(nextPath));
    const affectedActive = activeFile && (activeFile === folderPath || activeFile.startsWith(`${folderPath}/`));
    const nextActiveFile = affectedActive ? `${nextPath}${activeFile.slice(folderPath.length)}` : activeFile;

    renameFolder(folderPath, nextPath);
    if (affectedActive && nextActiveFile) {
      setActiveFile(nextActiveFile);
    }
    setToolbarMessage(`Renamed folder ${folderPath} to ${nextPath}.`);
  };

  const handleMoveFolder = (folderPath, targetParentFolderPath = '') => {
    if (!folderPath) {
      return;
    }

    const sourceName = folderPath.split('/').pop();
    const parent = normalizePathInput(targetParentFolderPath);
    const nextPath = parent ? `${parent}/${sourceName}` : sourceName;

    if (nextPath === folderPath) {
      return;
    }

    if (!nextPath || nextPath.startsWith(`${folderPath}/`)) {
      setToolbarMessage('Cannot move a folder into itself.');
      return;
    }

    if (folderHasPathConflict(folderPath, nextPath)) {
      setToolbarMessage(`Cannot move folder. Path conflict at ${nextPath}.`);
      return;
    }

    createFolderChain(parent);
    const affectedActive = activeFile && (activeFile === folderPath || activeFile.startsWith(`${folderPath}/`));
    const nextActiveFile = affectedActive ? `${nextPath}${activeFile.slice(folderPath.length)}` : activeFile;
    moveFolder(folderPath, nextPath);
    if (affectedActive && nextActiveFile) {
      setActiveFile(nextActiveFile);
    }
    setToolbarMessage(`Moved folder ${folderPath} to ${parent || '(root)'}.`);
  };

  const handleDeleteFolder = (folderPath) => {
    if (!folderPath) {
      return;
    }

    const affectedFiles = fileNames.filter((filePath) => filePath === folderPath || filePath.startsWith(`${folderPath}/`));
    if (affectedFiles.length > 0 && affectedFiles.length >= fileNames.length) {
      setToolbarMessage('At least one file must remain in the project.');
      return;
    }

    const message =
      affectedFiles.length > 0
        ? `Delete folder "${folderPath}" and ${affectedFiles.length} file(s)?`
        : `Delete empty folder "${folderPath}"?`;

    if (!window.confirm(message)) {
      return;
    }

    deleteFolder(folderPath);
    setToolbarMessage(`Deleted folder ${folderPath}.`);
  };

  const withGlobalDrag = (cursor, onMove, startEvent) => {
    if (startEvent && typeof startEvent.button === 'number' && startEvent.button !== 0) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = cursor;

    const dragShield = document.createElement('div');
    dragShield.setAttribute('aria-hidden', 'true');
    Object.assign(dragShield.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
      cursor,
      background: 'transparent'
    });
    document.body.appendChild(dragShield);

    let rafId = 0;
    let lastEvent = null;
    let cleanedUp = false;

    const flushMove = () => {
      rafId = 0;
      if (!lastEvent || cleanedUp) {
        return;
      }
      onMove(lastEvent);
      lastEvent = null;
    };

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;

      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;

      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }

      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      window.removeEventListener('blur', cleanup);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      dragShield.removeEventListener('mousemove', handleMouseMove);
      dragShield.removeEventListener('mouseup', cleanup);
      dragShield.remove();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        cleanup();
      }
    };

    const handleMouseMove = (event) => {
      // Stop resizing immediately when the primary button is no longer pressed.
      if ((event.buttons & 1) !== 1) {
        cleanup();
        return;
      }

      event.preventDefault();
      lastEvent = event;
      if (!rafId) {
        rafId = window.requestAnimationFrame(flushMove);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
    window.addEventListener('blur', cleanup);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    dragShield.addEventListener('mousemove', handleMouseMove);
    dragShield.addEventListener('mouseup', cleanup);
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
      ai: (startSizes.ai / 100) * usableWidth,
      console: (startSizes.console / 100) * usableWidth
    };

    const minEditor = 320;
    const minPreview = 320;
    const minConsole = 320;
    const minAi = 320;

    withGlobalDrag('col-resize', (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      let nextPx = { ...startPx };

      if (boundary === 'editor-preview') {
        nextPx.editor = Math.max(minEditor, Math.min(startPx.editor + delta, startPx.editor + startPx.preview - minPreview));
        nextPx.preview = startPx.editor + startPx.preview - nextPx.editor;
      } else if (boundary === 'editor-console') {
        nextPx.editor = Math.max(minEditor, Math.min(startPx.editor + delta, startPx.editor + startPx.console - minConsole));
        nextPx.console = startPx.editor + startPx.console - nextPx.editor;
      } else if (boundary === 'editor-ai') {
        nextPx.editor = Math.max(minEditor, Math.min(startPx.editor + delta, startPx.editor + startPx.ai - minAi));
        nextPx.ai = startPx.editor + startPx.ai - nextPx.editor;
      } else if (boundary === 'console-ai') {
        nextPx.console = Math.max(minConsole, Math.min(startPx.console + delta, startPx.console + startPx.ai - minAi));
        nextPx.ai = startPx.console + startPx.ai - nextPx.console;
      } else {
        nextPx.preview = Math.max(minPreview, Math.min(startPx.preview + delta, startPx.preview + startPx.ai - minAi));
        nextPx.ai = startPx.preview + startPx.ai - nextPx.preview;
      }

      const total = nextPx.editor + nextPx.preview + nextPx.ai + nextPx.console;
      setColumnWidths({
        editor: (nextPx.editor / total) * 100,
        preview: (nextPx.preview / total) * 100,
        ai: (nextPx.ai / total) * 100,
        console: (nextPx.console / total) * 100
      });
    }, event);
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
    }, event);
  };

  const startEditorExplorerResize = (event) => {
    if (!editorWorkspaceRef.current || viewportWidth <= 940 || !showExplorer) {
      return;
    }

    event.preventDefault();
    const rect = editorWorkspaceRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = editorExplorerWidth;
    const minWidth = 180;
    const maxWidth = Math.max(260, Math.min(420, rect.width - 220));

    withGlobalDrag('col-resize', (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      setEditorExplorerWidth(Math.max(minWidth, Math.min(startWidth + delta, maxWidth)));
    }, event);
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

  const injectCodeIntoActiveFile = useCallback(
    (snippet) => {
      const content = String(snippet || '');
      if (!content) {
        return { ok: false, error: 'No code snippet to inject.' };
      }

      if (!activeFile) {
        return { ok: false, error: 'No active file selected.' };
      }

      const editor = editorRef.current;
      const model = editor?.getModel?.();

      if (editor && model) {
        const selection = editor.getSelection();
        const position = editor.getPosition();
        const targetRange =
          selection && !selection.isEmpty()
            ? selection
            : {
                startLineNumber: position?.lineNumber || 1,
                startColumn: position?.column || 1,
                endLineNumber: position?.lineNumber || 1,
                endColumn: position?.column || 1
              };

        editor.executeEdits('ai-inline-inject', [
          {
            range: targetRange,
            text: content,
            forceMoveMarkers: true
          }
        ]);
        editor.pushUndoStop();
        editor.focus();
        return { ok: true, file: activeFile };
      }

      const current = files[activeFile] ?? '';
      const separator = current && !current.endsWith('\n') ? '\n' : '';
      updateFile(activeFile, `${current}${separator}${content}`);
      return { ok: true, file: activeFile };
    },
    [activeFile, files, updateFile]
  );

  const ideContextValue = useMemo(
    () => ({
      files,
      fileNames,
      activeTab: activeFile,
      setActiveTab: setActiveFile,
      setFileContent: updateFile,
      getSelection,
      injectCodeIntoActiveFile,
      consoleLogs: consoleEntries,
      lastRuntimeError
    }),
    [files, fileNames, activeFile, updateFile, injectCodeIntoActiveFile, consoleEntries, lastRuntimeError]
  );

  const visiblePanels = ['editor', 'preview', 'ai'].filter((panel) => panelVisibility[panel]);
  const showEditor = panelVisibility.editor;
  const showPreview = panelVisibility.preview;
  const showAi = panelVisibility.ai;
  const showStandaloneConsole = showConsole && !showPreview;
  const topLevelVisiblePanels = [...visiblePanels, ...(showStandaloneConsole ? ['console'] : [])];
  const getPanelLabel = (panel) => (panel === 'ai' ? 'Leaf chat' : panel.charAt(0).toUpperCase() + panel.slice(1));

  const togglePanelVisibility = (panel) => {
    let nextVisible = true;
    setPanelVisibility((prev) => {
      nextVisible = !prev[panel];
      return {
        ...prev,
        [panel]: nextVisible
      };
    });

    const panelLabel = getPanelLabel(panel);
    setToolbarMessage(`${panelLabel} ${nextVisible ? 'shown' : 'hidden'}.`);
  };

  const toggleConsoleVisibility = () => {
    setShowConsole((prev) => {
      const nextVisible = !prev;
      setToolbarMessage(`Console ${nextVisible ? 'shown' : 'hidden'}.`);
      return nextVisible;
    });
  };

  const hidePanel = (panel, reason = 'minimized') => {
    if (!panelVisibility[panel]) {
      return;
    }

    setPanelVisibility((prev) => ({
      ...prev,
      [panel]: false
    }));
    setToolbarMessage(`${getPanelLabel(panel)} ${reason}.`);
  };

  const focusPanel = (panel) => {
    setPanelVisibility({
      editor: panel === 'editor',
      preview: panel === 'preview',
      ai: panel === 'ai'
    });
    setToolbarMessage(`${getPanelLabel(panel)} focused.`);
  };

  const workspaceStyle = isDesktopResizable
    ? (() => {
        if (topLevelVisiblePanels.length <= 1) {
          return {
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: 0
          };
        }

        const minByPanel = {
          editor: 320,
          preview: 320,
          ai: 320,
          console: 320
        };

        const total = topLevelVisiblePanels.reduce((sum, panel) => sum + columnWidths[panel], 0) || 1;
        const panelColumns = topLevelVisiblePanels.map(
          (panel) => `minmax(${minByPanel[panel]}px, ${(columnWidths[panel] / total) * 100}fr)`
        );
        const gridColumns = [];
        panelColumns.forEach((column, index) => {
          gridColumns.push(column);
          if (index < panelColumns.length - 1) {
            gridColumns.push('10px');
          }
        });

        return {
          gridTemplateColumns: gridColumns.join(' '),
          gap: 0
        };
      })()
    : undefined;

  const previewPaneStyle = showConsole
    ? {
        gridTemplateRows: `minmax(0, ${previewPaneRatio}fr) 8px minmax(140px, ${1 - previewPaneRatio}fr)`
      }
    : {
        gridTemplateRows: 'minmax(0, 1fr)'
      };
  const editorWorkspaceStyle =
    viewportWidth > 940
      ? {
          gridTemplateColumns: showExplorer
            ? `${editorExplorerWidth}px 8px minmax(0, 1fr)`
            : 'minmax(0, 1fr)'
        }
      : undefined;

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
                  <UiIcon name="editor" className="btn-icon" />
                  <span className="btn-label">Editor</span>
                </button>
                <button
                  type="button"
                  className={`btn ${showPreview ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => togglePanelVisibility('preview')}
                  aria-pressed={showPreview}
                  title={`${showPreview ? 'Hide' : 'Show'} preview panel`}
                >
                  <UiIcon name="preview" className="btn-icon" />
                  <span className="btn-label">Preview</span>
                </button>
                <button
                  type="button"
                  className={`btn ${showConsole ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={toggleConsoleVisibility}
                  aria-pressed={showConsole}
                  title={`${showConsole ? 'Hide' : 'Show'} console window`}
                >
                  <UiIcon name="console" className="btn-icon" />
                  <span className="btn-label">Console</span>
                </button>
                <button
                  type="button"
                  className={`btn ${showAi ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => togglePanelVisibility('ai')}
                  aria-pressed={showAi}
                  title={`${showAi ? 'Hide' : 'Show'} Leaf chat panel`}
                >
                  <UiIcon name="chat" className="btn-icon" />
                  <span className="btn-label">Leaf chat</span>
                </button>
              </div>
            </div>
            <div className="toolbar-cluster">
              <span className="toolbar-cluster-label">Preview</span>
              <div className="toolbar-cluster-actions">
                {isPreviewPopoutOpen ? (
                  <span className="toolbar-status-badge" title="Preview is open in a separate window">
                    Detached
                  </span>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleRun}
                  title="Rebuild and refresh the preview using the current editor files"
                >
                  <UiIcon name="run" className="btn-icon" />
                  <span className="btn-label">Run</span>
                </button>
                {isPreviewPopoutOpen ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleFocusPreviewPopout}
                    title="Focus the detached preview window"
                  >
                    <UiIcon name="focus" className="btn-icon" />
                    <span className="btn-label">Focus Window</span>
                  </button>
                ) : null}
                {isPreviewPopoutOpen ? (
                  <button type="button" className="btn btn-ghost" onClick={handleDockPreview} title="Close the detached window and use the docked preview panel">
                    <UiIcon name="dock" className="btn-icon" />
                    <span className="btn-label">Dock Back</span>
                  </button>
                ) : null}
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
                  <UiIcon name="export" className="btn-icon" />
                  <span className="btn-label">Export</span>
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleResetProject}
                  title="Restore the default starter files and clear console output"
                >
                  <UiIcon name="reset" className="btn-icon" />
                  <span className="btn-label">Reset</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main ref={workspaceRef} className="workspace-grid" style={workspaceStyle}>
          {showEditor ? (
          <section className="panel panel-editor">
            <div className="panel-header">
              <div className="panel-window-controls" role="toolbar" aria-label="Editor window controls">
                <button
                  type="button"
                  className="window-control window-control-close"
                  onClick={() => hidePanel('editor', 'closed')}
                  aria-label="Close editor window"
                  title="Close editor window"
                />
                <button
                  type="button"
                  className="window-control window-control-zoom"
                  onClick={() => focusPanel('editor')}
                  aria-label="Enlarge editor window"
                  title="Enlarge editor window"
                />
              </div>
              <h2 className="panel-title">
                <UiIcon name="editor" className="panel-title-icon" />
                <span className="panel-title-text">Editor</span>
              </h2>
              <div className="panel-header-actions">
                <button
                  type="button"
                  className={`btn btn-ghost btn-small ${showExplorer ? '' : 'is-inactive'}`}
                  onClick={() => setShowExplorer((prev) => !prev)}
                  aria-pressed={showExplorer}
                  title={`${showExplorer ? 'Hide' : 'Show'} explorer sidebar`}
                >
                  Explorer
                </button>
              </div>
            </div>
            <div className="panel-body panel-body-editor">
              <div ref={editorWorkspaceRef} className="editor-workspace" style={editorWorkspaceStyle}>
                {showExplorer ? (
                  <>
                    <FileExplorer
                      fileNames={fileNames}
                      folders={folders}
                      activeFile={activeFile}
                      onSelectFile={setActiveFile}
                      onNewFile={handleCreateFile}
                      onNewFolder={handleCreateFolder}
                      onDeleteFile={handleDeleteActiveFile}
                      onRenameActiveFile={handleRenameActiveFile}
                      onDeleteFileByPath={handleDeleteFileByPath}
                      onRenameFile={handleRenameFile}
                      onDeleteFolder={handleDeleteFolder}
                      onRenameFolder={handleRenameFolder}
                      onMoveFile={handleMoveFile}
                      onMoveFolder={handleMoveFolder}
                    />
                    <div
                      className="editor-side-resizer"
                      onMouseDown={startEditorExplorerResize}
                      aria-hidden="true"
                      title="Resize explorer"
                    />
                  </>
                ) : null}

                <div className="editor-main">
                  <FileTabs files={fileNames} activeFile={activeFile} onSelect={setActiveFile} />
                  <div className="editor-surface">
                    <CodeEditor
                      language={inferLanguageFromFileName(activeFile)}
                      path={activeFile}
                      value={files[activeFile] ?? ''}
                      onChange={(value) => {
                        if (!activeFile) {
                          return;
                        }
                        updateFile(activeFile, value);
                      }}
                      onMount={handleEditorMount}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
          ) : null}
          {isDesktopResizable && showEditor && showPreview ? (
            <div
              className="workspace-column-resizer"
              onMouseDown={startColumnResize('editor-preview')}
              aria-hidden="true"
              title="Resize panels"
            />
          ) : null}
          {isDesktopResizable && showEditor && !showPreview && showStandaloneConsole ? (
            <div
              className="workspace-column-resizer"
              onMouseDown={startColumnResize('editor-console')}
              aria-hidden="true"
              title="Resize panels"
            />
          ) : null}
          {isDesktopResizable && showEditor && !showPreview && !showStandaloneConsole && showAi ? (
            <div
              className="workspace-column-resizer"
              onMouseDown={startColumnResize('editor-ai')}
              aria-hidden="true"
              title="Resize panels"
            />
          ) : null}

          {showPreview ? (
          <section className="panel panel-preview">
            <div className="panel-header">
              <div className="panel-window-controls" role="toolbar" aria-label="Preview window controls">
                <button
                  type="button"
                  className="window-control window-control-close"
                  onClick={() => hidePanel('preview', 'closed')}
                  aria-label="Close preview window"
                  title="Close preview window"
                />
                <button
                  type="button"
                  className="window-control window-control-zoom"
                  onClick={() => focusPanel('preview')}
                  aria-label="Enlarge preview window"
                  title="Enlarge preview window"
                />
              </div>
              <h2 className="panel-title">
                <UiIcon name="preview" className="panel-title-icon" />
                <span className="panel-title-text">Preview</span>
              </h2>
              <div className="panel-header-actions">
                {!isPreviewPopoutOpen ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={handlePopoutPreview}
                    title="Open the preview in a separate window and close this panel"
                  >
                    Pop Out
                  </button>
                ) : null}
                {isPreviewPopoutOpen ? <span className="panel-status-pill">Detached</span> : null}
                {isPreviewPopoutOpen ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={handleFocusPreviewPopout}
                    title="Focus the detached preview window"
                  >
                    Focus Window
                  </button>
                ) : null}
                {isPreviewPopoutOpen ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={handleDockPreview}
                    title="Dock the preview back into this panel"
                  >
                    Dock Back
                  </button>
                ) : null}
              </div>
            </div>
            <div ref={previewPanelBodyRef} className="panel-body panel-body-preview" style={previewPaneStyle}>
              <div className="preview-surface">
                <PreviewFrame iframeRef={iframeRef} srcDoc={srcDoc} />
              </div>
              {showConsole ? (
                <>
                  <div
                    className="panel-resizer-inline panel-resizer-horizontal"
                    onMouseDown={startPreviewConsoleResize}
                    aria-hidden="true"
                  />
                  <div className="console-surface">
                    <ConsolePanel
                      entries={consoleEntries}
                      onClear={handleClearConsole}
                      onClose={() => {
                        setShowConsole(false);
                        setToolbarMessage('Console closed.');
                      }}
                      onZoom={() => {
                        setShowConsole(true);
                        setPreviewPaneRatio(0.35);
                        setToolbarMessage('Console enlarged.');
                      }}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </section>
          ) : null}
          {isDesktopResizable && showPreview && showAi ? (
            <div
              className="workspace-column-resizer"
              onMouseDown={startColumnResize('preview-ai')}
              aria-hidden="true"
              title="Resize panels"
            />
          ) : null}

          {showStandaloneConsole ? (
          <section className="panel panel-console">
            <div className="panel-header">
              <div className="panel-window-controls" role="toolbar" aria-label="Console window controls">
                <button
                  type="button"
                  className="window-control window-control-close"
                  onClick={() => {
                    setShowConsole(false);
                    setToolbarMessage('Console closed.');
                  }}
                  aria-label="Close console window"
                  title="Close console window"
                />
                <button
                  type="button"
                  className="window-control window-control-zoom"
                  onClick={() => {
                    setPanelVisibility({
                      editor: false,
                      preview: false,
                      ai: false
                    });
                    setShowConsole(true);
                    setToolbarMessage('Console focused.');
                  }}
                  aria-label="Enlarge console window"
                  title="Enlarge console window"
                />
              </div>
              <h2 className="panel-title">
                <UiIcon name="console" className="panel-title-icon" />
                <span className="panel-title-text">Console</span>
              </h2>
            </div>
            <div className="panel-body" style={{ paddingTop: 0, minHeight: 0 }}>
              <div className="console-surface" style={{ height: '100%' }}>
                <ConsolePanel entries={consoleEntries} onClear={handleClearConsole} showWindowControls={false} />
              </div>
            </div>
          </section>
          ) : null}
          {isDesktopResizable && showStandaloneConsole && showAi ? (
            <div
              className="workspace-column-resizer"
              onMouseDown={startColumnResize('console-ai')}
              aria-hidden="true"
              title="Resize panels"
            />
          ) : null}

          {showAi ? (
            <AiPanel
              onClose={() => hidePanel('ai', 'closed')}
              onZoom={() => focusPanel('ai')}
            />
          ) : null}

          {topLevelVisiblePanels.length === 0 ? (
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
