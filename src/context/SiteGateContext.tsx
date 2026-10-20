import { createContext, useContext } from 'react';

export interface SiteGateContextType {
  isUnlocked: boolean;
  lockTerminal: () => void;
  unlockTerminal: () => void;
}

export const SiteGateContext = createContext<SiteGateContextType>({
  isUnlocked: false,
  lockTerminal: () => {},
  unlockTerminal: () => {},
});

export const useSiteGate = () => useContext(SiteGateContext);
