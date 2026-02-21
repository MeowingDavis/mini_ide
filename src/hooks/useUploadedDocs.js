import useLocalStorageState from './useLocalStorageState';

const UPLOADED_DOCS_KEY = 'mini-ide:uploaded-docs';

function createDoc(fileName, content) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: fileName,
    content
  };
}

function useUploadedDocs() {
  const [uploadedDocs, setUploadedDocs] = useLocalStorageState(UPLOADED_DOCS_KEY, []);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
      return 0;
    }

    const nextDocs = await Promise.all(
      files.map(async (file) => createDoc(file.name, await file.text()))
    );

    setUploadedDocs((prev) => [...nextDocs, ...prev].slice(0, 25));
    return nextDocs.length;
  };

  const removeDoc = (docId) => {
    setUploadedDocs((prev) => prev.filter((doc) => doc.id !== docId));
  };

  const clearDocs = () => {
    setUploadedDocs([]);
  };

  return {
    uploadedDocs,
    addFiles,
    removeDoc,
    clearDocs
  };
}

export default useUploadedDocs;
