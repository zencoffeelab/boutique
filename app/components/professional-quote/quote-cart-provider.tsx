import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ProfessionalQuoteCartLine } from "~/domain/types";
import { safeJson } from "~/lib/utils";

type QuoteCartContextValue = {
  lines: ProfessionalQuoteCartLine[];
  totalKilograms: number;
  hydrated: boolean;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  addLine: (line: ProfessionalQuoteCartLine) => void;
  updateKilograms: (productId: string, kilograms: number) => void;
  removeLine: (productId: string) => void;
  clear: () => void;
};

const QuoteCartContext = createContext<QuoteCartContextValue | null>(null);

export function QuoteCartProvider({ children, storageNamespace = "guest" }: { children: ReactNode; storageNamespace?: string }) {
  const storageKey = `zcl:professional-quote-cart:v1:${storageNamespace}`;
  const [lines, setLines] = useState<ProfessionalQuoteCartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const stored = safeJson<ProfessionalQuoteCartLine[]>(window.localStorage.getItem(storageKey), []);
    setLines(stored.filter((line) => Number.isInteger(line.kilograms) && line.kilograms > 0));
    setHydrated(true);
  }, [storageKey]);
  useEffect(() => {
    if (hydrated) window.localStorage.setItem(storageKey, JSON.stringify(lines));
  }, [hydrated, lines]);

  const addLine = useCallback((line: ProfessionalQuoteCartLine) => {
    setLines((current) => {
      const existing = current.find((candidate) => candidate.productId === line.productId);
      if (!existing) return [...current, line];
      return current.map((candidate) => candidate.productId === line.productId
        ? { ...line, kilograms: Math.min(Math.floor(line.availableKilograms), candidate.kilograms + line.kilograms) }
        : candidate);
    });
  }, []);
  const updateKilograms = useCallback((productId: string, kilograms: number) => {
    setLines((current) => current
      .map((line) => line.productId === productId
        ? { ...line, kilograms: Math.min(Math.floor(line.availableKilograms), Math.max(0, Math.floor(kilograms))) }
        : line)
      .filter((line) => line.kilograms > 0));
  }, []);
  const removeLine = useCallback((productId: string) => {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }, []);
  const clear = useCallback(() => setLines([]), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const value = useMemo(() => ({
    lines,
    totalKilograms: lines.reduce((total, line) => total + line.kilograms, 0),
    hydrated,
    drawerOpen,
    openDrawer,
    closeDrawer,
    addLine,
    updateKilograms,
    removeLine,
    clear,
  }), [addLine, clear, closeDrawer, drawerOpen, hydrated, lines, openDrawer, removeLine, updateKilograms]);
  return <QuoteCartContext.Provider value={value}>{children}</QuoteCartContext.Provider>;
}

export function useQuoteCart() {
  const context = useContext(QuoteCartContext);
  if (!context) throw new Error("useQuoteCart must be used within QuoteCartProvider.");
  return context;
}
