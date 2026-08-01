import React, { createContext, useContext, useState } from 'react';

interface LayoutContextType {
  hideMobileHeader: boolean;
  setHideMobileHeader: (hide: boolean) => void;
}

const LayoutContext = createContext<LayoutContextType>({
  hideMobileHeader: false,
  setHideMobileHeader: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useLayout = () => useContext(LayoutContext);

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hideMobileHeader, setHideMobileHeader] = useState(false);

  return (
    <LayoutContext.Provider value={{ hideMobileHeader, setHideMobileHeader }}>
      {children}
    </LayoutContext.Provider>
  );
};
