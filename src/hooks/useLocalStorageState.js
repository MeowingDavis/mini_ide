import { useEffect, useState } from 'react';

function resolveInitial(initialValue) {
  return typeof initialValue === 'function' ? initialValue() : initialValue;
}

function useLocalStorageState(key, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to parse localStorage value:', error);
    }

    return resolveInitial(initialValue);
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to write localStorage value:', error);
    }
  }, [key, state]);

  return [state, setState];
}

export default useLocalStorageState;
