import { CheckCircle2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Audience, CartLine, Locale } from "~/domain/types";
import { safeJson } from "~/lib/utils";

const storageKey = "zcl:cart:v1";

type CartAddedNotification = Readonly<{
  id: number;
  productName: string;
  variantLabel: string;
}>;

type CartContextValue = {
  lines: CartLine[];
  itemCount: number;
  hydrated: boolean;
  drawerOpen: boolean;
  addedNotification: CartAddedNotification | null;
  openDrawer: () => void;
  closeDrawer: () => void;
  dismissAddedNotification: () => void;
  addItem: (item: Omit<CartLine, "quantity"> & { quantity?: number }) => void;
  updateQuantity: (variantId: string, audience: Audience, quantity: number) => void;
  removeItem: (variantId: string, audience: Audience) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function CartAddedToast({ notification, locale, onClose }: { notification: CartAddedNotification; locale: Locale; onClose: () => void }) {
  const english = locale === "en-GB";
  return <div className="cart-added-toast" role="status" aria-live="polite" aria-atomic="true">
    <span className="cart-added-toast__icon"><CheckCircle2 aria-hidden="true" /></span>
    <span className="cart-added-toast__copy"><strong>{english ? "Added to cart" : "Ajouté au panier"}</strong><span>{notification.productName}{notification.variantLabel ? ` · ${notification.variantLabel}` : ""}</span></span>
    <button type="button" onClick={onClose} aria-label={english ? "Close confirmation" : "Fermer la confirmation"}><X aria-hidden="true" /></button>
  </div>;
}

export function CartProvider({ children, locale = "fr-FR" }: { children: ReactNode; locale?: Locale }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addedNotification, setAddedNotification] = useState<CartAddedNotification | null>(null);
  const notificationId = useRef(0);
  useEffect(() => {
    const stored = safeJson<CartLine[]>(window.localStorage.getItem(storageKey), []);
    setLines((current) => current.length > 0 ? current : stored.filter((line) => Number.isSafeInteger(line.quantity) && line.quantity > 0));
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) window.localStorage.setItem(storageKey, JSON.stringify(lines));
  }, [hydrated, lines]);
  useEffect(() => {
    if (!addedNotification) return;
    const timeout = window.setTimeout(() => setAddedNotification(null), 3_500);
    return () => window.clearTimeout(timeout);
  }, [addedNotification]);

  const addItem = useCallback<CartContextValue["addItem"]>((item) => {
    const quantity = item.quantity ?? 1;
    setLines((current) => {
      const index = current.findIndex((line) => line.variantId === item.variantId && line.audience === item.audience);
      if (index < 0) return [...current, { ...item, quantity }];
      return current.map((line, lineIndex) => lineIndex === index ? { ...line, ...item, quantity: Math.min(100, line.quantity + quantity) } : line);
    });
    notificationId.current += 1;
    setAddedNotification({
      id: notificationId.current,
      productName: item.preview?.productNames[locale] ?? (locale === "en-GB" ? "Coffee" : "Café"),
      variantLabel: item.preview?.variantLabel ?? "",
    });
  }, [locale]);
  const updateQuantity = useCallback((variantId: string, audience: Audience, quantity: number) => {
    setLines((current) => current
      .map((line) => line.variantId === variantId && line.audience === audience ? { ...line, quantity: Math.max(0, Math.min(100, quantity)) } : line)
      .filter((line) => line.quantity > 0));
  }, []);
  const removeItem = useCallback((variantId: string, audience: Audience) => {
    setLines((current) => current.filter((line) => line.variantId !== variantId || line.audience !== audience));
  }, []);
  const clear = useCallback(() => setLines([]), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const dismissAddedNotification = useCallback(() => setAddedNotification(null), []);
  const value = useMemo(() => ({
    lines,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    hydrated,
    drawerOpen,
    addedNotification,
    openDrawer,
    closeDrawer,
    dismissAddedNotification,
    addItem,
    updateQuantity,
    removeItem,
    clear,
  }), [addItem, addedNotification, clear, closeDrawer, dismissAddedNotification, drawerOpen, hydrated, lines, openDrawer, removeItem, updateQuantity]);
  return <CartContext.Provider value={value}>
    {children}
    {addedNotification && !drawerOpen ? <CartAddedToast key={addedNotification.id} notification={addedNotification} locale={locale} onClose={dismissAddedNotification} /> : null}
  </CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider.");
  return context;
}
