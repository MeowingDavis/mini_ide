import { useCallback } from 'react';
import useLocalStorageState from './useLocalStorageState';

const SESSION_STORAGE_KEY = 'mini-ide:groq-api-key:session';
const LOCAL_STORAGE_KEY = 'mini-ide:groq-api-key:local';

function normalize(value) {
  return String(value || '');
}

function useGroqApiKey(rememberOnThisDevice) {
  const [sessionApiKey, setSessionApiKey] = useLocalStorageState(SESSION_STORAGE_KEY, '', {
    storage: 'session'
  });
  const [localApiKey, setLocalApiKey] = useLocalStorageState(LOCAL_STORAGE_KEY, '');
  const remember = Boolean(rememberOnThisDevice);
  const apiKey = remember ? localApiKey : sessionApiKey;

  const setApiKey = useCallback(
    (value) => {
      const nextValue = normalize(value);

      if (remember) {
        setLocalApiKey(nextValue);
        if (sessionApiKey) {
          setSessionApiKey('');
        }
        return;
      }

      setSessionApiKey(nextValue);
      if (localApiKey) {
        setLocalApiKey('');
      }
    },
    [localApiKey, remember, sessionApiKey, setLocalApiKey, setSessionApiKey]
  );

  const clearApiKey = useCallback(() => {
    setSessionApiKey('');
    setLocalApiKey('');
  }, [setLocalApiKey, setSessionApiKey]);

  const moveApiKeyToStorage = useCallback(
    (nextRememberValue) => {
      const nextRemember = Boolean(nextRememberValue);
      if (nextRemember === remember) {
        return;
      }

      const currentValue = normalize(apiKey);
      if (nextRemember) {
        setLocalApiKey(currentValue);
        setSessionApiKey('');
        return;
      }

      setSessionApiKey(currentValue);
      setLocalApiKey('');
    },
    [apiKey, remember, setLocalApiKey, setSessionApiKey]
  );

  return {
    apiKey,
    clearApiKey,
    moveApiKeyToStorage,
    setApiKey
  };
}

export default useGroqApiKey;
