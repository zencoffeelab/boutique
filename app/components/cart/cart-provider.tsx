import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Audience, CartLine } from "~/domain/types";
import { safeJson } from "~/lib/utils";

const storageKey = "zcl:cart:v1";

type CartContextValue = {
  lines: CartLine[];
  itemCount: number;
  hydrated: boolean;
  addItem: (item: Omit<CartLine, "quantity"> & { quantity?: number }) => void;
  updateQuantity: (variantId: string, audience: Audience, quantity: number) => void;
  removeItem: (variantId: string, audience: Audience) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const stored = safeJson<CartLine[]>(window.localStorage.getItem(storageKey), []);
    setLines((current) => current.length > 0 ? current : stored.filter((line) => Number.isSafeInteger(line.quantity) && line.quantity > 0));
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) window.localStorage.setItem(storageKey, JSON.stringify(lines));
  }, [hydrated, lines]);

  const addItem = useCallback<CartContextValue["addItem"]>((item) => {
    const quantity = item.quantity ?? 1;
    setLines((current) => {
      const index = current.findIndex((line) => line.variantId === item.variantId && line.audience === item.audience);
      if (index < 0) return [...current, { ...item, quantity }];
      return current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Math.min(100, line.quantity + quantity) } : line);
    });
  }, []);
  const updateQuantity = useCallback((variantId: string, audience: Audience, quantity: number) => {
    setLines((current) => current
      .map((line) => line.variantId === variantId && line.audience === audience ? { ...line, quantity: Math.max(0, Math.min(100, quantity)) } : line)
      .filter((line) => line.quantity > 0));
  }, []);
  const removeItem = useCallback((variantId: string, audience: Audience) => {
    setLines((current) => current.filter((line) => line.variantId !== variantId || line.audience !== audience));
  }, []);
  const clear = useCallback(() => setLines([]), []);
  const value = useMemo(() => ({
    lines,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    hydrated,
    addItem,
    updateQuantity,
    removeItem,
    clear,
  }), [addItem, clear, hydrated, lines, removeItem, updateQuantity]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider.");
  return context;
}
