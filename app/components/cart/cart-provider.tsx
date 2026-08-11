import { CheckCircle2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Audience, CartLine, Locale } from "~/domain/types";
import { safeJson } from "~/lib/utils";

const storageKey = "zcl:cart:v1";
export const CART_RETENTION_MS = 30 * 60 * 1000;

type StoredCart = Readonly<{
  lines: CartLine[];
  expiresAt: number;
}>;

function readStoredCart(raw: string | null, now = Date.now()): StoredCart | null {
  const parsed = safeJson<StoredCart | CartLine[]>(raw, []);
  const legacyLines = Array.isArray(parsed) ? parsed : parsed.lines;
  const expiresAt = Array.isArray(parsed) ? now + CART_RETENTION_MS : parsed.expiresAt;
  if (!Array.isArray(legacyLines) || !Number.isFinite(expiresAt) || expiresAt <= now) return null;
  const lines = legacyLines.filter((line) => Number.isSafeInteger(line.quantity) && line.quantity > 0);
  return lines.length > 0 ? { lines, expiresAt } : null;
}

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
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addedNotification, setAddedNotification] = useState<CartAddedNotification | null>(null);
  const notificationId = useRef(0);
  useEffect(() => {
    const stored = readStoredCart(window.localStorage.getItem(storageKey));
    if (stored) {
      setLines((current) => current.length > 0 ? current : stored.lines);
      setExpiresAt(stored.expiresAt);
    } else {
      window.localStorage.removeItem(storageKey);
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    if (!lines.length || !expiresAt || expiresAt <= Date.now()) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify({ lines, expiresAt } satisfies StoredCart));
  }, [expiresAt, hydrated, lines]);
  useEffect(() => {
    if (!expiresAt) return;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      setLines([]);
      setExpiresAt(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      setLines([]);
      setExpiresAt(null);
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [expiresAt]);
  useEffect(() => {
    if (!addedNotification) return;
    const timeout = window.setTimeout(() => setAddedNotification(null), 3_500);
    return () => window.clearTimeout(timeout);
  }, [addedNotification]);

  const addItem = useCallback<CartContextValue["addItem"]>((item) => {
    const quantity = item.quantity ?? 1;
    if (lines.length === 0) setExpiresAt(Date.now() + CART_RETENTION_MS);
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
  }, [lines.length, locale]);
  const updateQuantity = useCallback((variantId: string, audience: Audience, quantity: number) => {
    setLines((current) => current
      .map((line) => line.variantId === variantId && line.audience === audience ? { ...line, quantity: Math.max(0, Math.min(100, quantity)) } : line)
      .filter((line) => line.quantity > 0));
  }, []);
  const removeItem = useCallback((variantId: string, audience: Audience) => {
    setLines((current) => current.filter((line) => line.variantId !== variantId || line.audience !== audience));
  }, []);
  const clear = useCallback(() => { setLines([]); setExpiresAt(null); }, []);
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
