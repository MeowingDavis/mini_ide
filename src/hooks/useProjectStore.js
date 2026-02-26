import useLocalStorageState from './useLocalStorageState';
import { DEFAULT_PROJECT_FILES } from '../lib/defaultProject';

const FILES_KEY = 'mini-ide:files';
const FOLDERS_KEY = 'mini-ide:folders';
const AUTO_RUN_KEY = 'mini-ide:auto-run';

function getDefaultFiles() {
  return { ...DEFAULT_PROJECT_FILES };
}

function useProjectStore() {
  const [files, setFiles] = useLocalStorageState(FILES_KEY, getDefaultFiles);
  const [folders, setFolders] = useLocalStorageState(FOLDERS_KEY, () => []);
  const [autoRun, setAutoRun] = useLocalStorageState(AUTO_RUN_KEY, false);

  const updateFile = (fileName, content) => {
    setFiles((prev) => ({
      ...prev,
      [fileName]: content
    }));
  };

  const createFile = (fileName, content = '') => {
    setFiles((prev) => ({
      ...prev,
      [fileName]: content
    }));
  };

  const deleteFile = (fileName) => {
    setFiles((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, fileName)) {
        return prev;
      }

      const next = { ...prev };
      delete next[fileName];

      return Object.keys(next).length > 0 ? next : prev;
    });
  };

  const createFolder = (folderPath) => {
    setFolders((prev) => {
      if (prev.includes(folderPath)) {
        return prev;
      }

      return [...prev, folderPath];
    });
  };

  const renameFile = (fromPath, toPath) => {
    if (!fromPath || !toPath || fromPath === toPath) {
      return;
    }

    setFiles((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, fromPath)) {
        return prev;
      }

      if (Object.prototype.hasOwnProperty.call(prev, toPath)) {
        return prev;
      }

      const next = { ...prev };
      next[toPath] = next[fromPath];
      delete next[fromPath];
      return next;
    });
  };

  const moveFile = (fromPath, toPath) => {
    renameFile(fromPath, toPath);
  };

  const renameFolder = (fromPath, toPath) => {
    if (!fromPath || !toPath || fromPath === toPath) {
      return;
    }

    setFiles((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const [filePath, content] of Object.entries(prev)) {
        if (filePath === fromPath || filePath.startsWith(`${fromPath}/`)) {
          const suffix = filePath.slice(fromPath.length);
          const targetPath = `${toPath}${suffix}`;

          if (
            targetPath !== filePath &&
            Object.prototype.hasOwnProperty.call(prev, targetPath) &&
            !(targetPath === fromPath || targetPath.startsWith(`${fromPath}/`))
          ) {
            return prev;
          }

          next[targetPath] = content;
          if (targetPath !== filePath) {
            delete next[filePath];
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });

    setFolders((prev) => {
      const updated = prev.map((folderPath) => {
        if (folderPath === fromPath || folderPath.startsWith(`${fromPath}/`)) {
          const suffix = folderPath.slice(fromPath.length);
          return `${toPath}${suffix}`;
        }
        return folderPath;
      });

      return [...new Set(updated)];
    });
  };

  const moveFolder = (fromPath, toPath) => {
    renameFolder(fromPath, toPath);
  };

  const deleteFolder = (folderPath) => {
    if (!folderPath) {
      return;
    }

    setFiles((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const filePath of Object.keys(prev)) {
        if (filePath === folderPath || filePath.startsWith(`${folderPath}/`)) {
          delete next[filePath];
          changed = true;
        }
      }

      if (!changed) {
        return prev;
      }

      return Object.keys(next).length > 0 ? next : prev;
    });

    setFolders((prev) => prev.filter((path) => !(path === folderPath || path.startsWith(`${folderPath}/`))));
  };

  const resetProject = () => {
    setFiles(getDefaultFiles());
    setFolders([]);
    setAutoRun(false);
  };

  return {
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
  };
}

export default useProjectStore;
