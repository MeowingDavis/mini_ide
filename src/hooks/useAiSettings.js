import { useCallback } from 'react';
import useLocalStorageState from './useLocalStorageState';

const AI_SETTINGS_KEY = 'mini-ide:ai-settings';
const ENV_PROVIDER = (import.meta.env.VITE_AI_PROVIDER || '').trim().toLowerCase();
const ENV_OLLAMA_ENDPOINT = (import.meta.env.VITE_OLLAMA_ENDPOINT || '').trim();

const DEFAULT_AI_SETTINGS = {
  provider: ENV_PROVIDER === 'groq' ? 'groq' : 'ollama',
  ollamaEndpoint: ENV_OLLAMA_ENDPOINT || 'http://localhost:11434',
  selectedModel: '',
  includeCode: true,
  includeSelection: true,
  includeUploads: true,
  streaming: true,
  mode: 'chat'
};

function useAiSettings() {
  const [settings, setSettings] = useLocalStorageState(AI_SETTINGS_KEY, DEFAULT_AI_SETTINGS);

  const setSetting = useCallback(
    (key, value) => {
      setSettings((prev) => ({
        ...DEFAULT_AI_SETTINGS,
        ...prev,
        [key]: value
      }));
    },
    [setSettings]
  );

  return {
    settings: (() => {
      const merged = {
        ...DEFAULT_AI_SETTINGS,
        ...settings
      };

      // Backward-compat: migrate old single endpoint key to Ollama endpoint.
      if (settings?.endpoint && !settings?.ollamaEndpoint) {
        merged.ollamaEndpoint = settings.endpoint;
      }

      // Env vars remain fallback values when no user-stored value exists.
      if (!merged.ollamaEndpoint && ENV_OLLAMA_ENDPOINT) {
        merged.ollamaEndpoint = ENV_OLLAMA_ENDPOINT;
      }

      return merged;
    })(),
    setSetting
  };
}

export default useAiSettings;
