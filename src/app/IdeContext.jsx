import { createContext, useContext } from 'react';

const IdeContext = createContext(null);

export function IdeProvider({ value, children }) {
  return <IdeContext.Provider value={value}>{children}</IdeContext.Provider>;
}

export function useIdeContext() {
  const context = useContext(IdeContext);

  if (!context) {
    throw new Error('useIdeContext must be used inside IdeProvider');
  }

  return context;
}
