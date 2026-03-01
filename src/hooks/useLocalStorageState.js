import { useEffect, useState } from 'react';

function resolveInitial(initialValue) {
  return typeof initialValue === 'function' ? initialValue() : initialValue;
}

function resolveStorage(storageType) {
  if (typeof window === 'undefined') {
    return null;
  }

  if (storageType === 'session') {
    return window.sessionStorage;
  }

  return window.localStorage;
}

function useLocalStorageState(key, initialValue, options = {}) {
  const storageType = options.storage === 'session' ? 'session' : 'local';

  const [state, setState] = useState(() => {
    try {
      const storage = resolveStorage(storageType);
      const stored = storage?.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error(`Failed to parse ${storageType}Storage value:`, error);
    }

    return resolveInitial(initialValue);
  });

  useEffect(() => {
    try {
      const storage = resolveStorage(storageType);
      storage?.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error(`Failed to write ${storageType}Storage value:`, error);
    }
  }, [key, state, storageType]);

  return [state, setState];
}

export default useLocalStorageState;
