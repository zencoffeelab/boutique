import { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "~/domain/types";

type AddressSuggestion = Readonly<{ line1: string; postalCode: string; city: string; label: string }>;

function setFieldValue(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) return;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

export function AddressAutocomplete({
  id,
  defaultValue = "",
  countryCode,
  locale,
}: {
  id?: string;
  defaultValue?: string;
  countryCode?: string;
  locale: Locale;
}) {
  const listId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<readonly AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const english = locale === "en-GB";

  useEffect(() => {
    const form = wrapperRef.current?.closest("form");
    const countryField = form?.elements.namedItem("countryCode");
    const selectedCountry = countryCode ?? (countryField instanceof HTMLSelectElement ? countryField.value : "FR");
    if (selectedCountry !== "FR" || value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/address-suggestions?q=${encodeURIComponent(value)}&countryCode=FR`, { signal: controller.signal });
        const data = await response.json() as { suggestions?: AddressSuggestion[] };
        if (!response.ok || controller.signal.aborted) return;
        setSuggestions(data.suggestions ?? []);
        setOpen((data.suggestions?.length ?? 0) > 0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSuggestions([]);
          setOpen(false);
        }
      }
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [countryCode, value]);

  const choose = (suggestion: AddressSuggestion) => {
    setValue(suggestion.line1);
    const form = wrapperRef.current?.closest("form");
    if (form) {
      setFieldValue(form, "postalCode", suggestion.postalCode);
      setFieldValue(form, "city", suggestion.city);
    }
    setSuggestions([]);
    setOpen(false);
  };

  return <span className="address-autocomplete" ref={wrapperRef}>
    <input id={id} name="line1" value={value} required autoComplete="address-line1" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} onChange={(event) => setValue(event.currentTarget.value)} onFocus={() => suggestions.length && setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} />
    {open ? <span id={listId} className="address-autocomplete__suggestions" role="listbox" aria-label={english ? "Address suggestions" : "Suggestions d’adresse"}>
      {suggestions.map((suggestion) => <button key={`${suggestion.line1}-${suggestion.postalCode}-${suggestion.city}`} type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(suggestion)}><strong>{suggestion.line1}</strong><small>{suggestion.postalCode} {suggestion.city}</small></button>)}
    </span> : null}
  </span>;
}
