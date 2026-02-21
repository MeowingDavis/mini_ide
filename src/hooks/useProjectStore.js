import useLocalStorageState from './useLocalStorageState';
import { DEFAULT_PROJECT_FILES } from '../lib/defaultProject';

const FILES_KEY = 'mini-ide:files';
const AUTO_RUN_KEY = 'mini-ide:auto-run';

function getDefaultFiles() {
  return { ...DEFAULT_PROJECT_FILES };
}

function useProjectStore() {
  const [files, setFiles] = useLocalStorageState(FILES_KEY, getDefaultFiles);
  const [autoRun, setAutoRun] = useLocalStorageState(AUTO_RUN_KEY, true);

  const updateFile = (fileName, content) => {
    setFiles((prev) => ({
      ...prev,
      [fileName]: content
    }));
  };

  const resetProject = () => {
    setFiles(getDefaultFiles());
    setAutoRun(true);
  };

  return {
    files,
    updateFile,
    autoRun,
    setAutoRun,
    resetProject
  };
}

export default useProjectStore;
