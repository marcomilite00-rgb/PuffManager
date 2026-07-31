import React, { createContext, useContext, useState, useCallback } from 'react';

interface CartContextType {
  cartOpen: boolean;
  cartContent: React.ReactNode | null;
  openCart: (content: React.ReactNode) => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextType>({
  cartOpen: false,
  cartContent: null,
  openCart: () => {},
  closeCart: () => {},
});

export const useCartDrawer = () => useContext(CartContext);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cartOpen, setCartOpen] = useState(false);
  const [cartContent, setCartContent] = useState<React.ReactNode | null>(null);

  const openCart = useCallback((content: React.ReactNode) => {
    setCartContent(content);
    setCartOpen(true);
  }, []);

  const closeCart = useCallback(() => {
    setCartOpen(false);
    setTimeout(() => setCartContent(null), 300);
  }, []);

  return (
    <CartContext.Provider value={{ cartOpen, cartContent, openCart, closeCart }}>
      {children}
    </CartContext.Provider>
  );
};
