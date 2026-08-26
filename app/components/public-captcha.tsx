import { useEffect, useRef, useState } from "react";

type RecaptchaApi = { ready(callback: () => void): void; render(element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }): number };
type TurnstileApi = { render(element: HTMLElement, options: { sitekey: string; action: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }): string };

declare global {
  interface Window { grecaptcha?: RecaptchaApi; turnstile?: TurnstileApi; }
}

const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? "";
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

function loadScript(id: string, src: string) {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Unable to load ${id}`));
    document.head.appendChild(script);
  });
}

function tokenInput(form: HTMLFormElement, name: string) {
  return form.elements.namedItem(name) as HTMLInputElement | null;
}

export function getPublicCaptchaTokens(form: HTMLFormElement) {
  return {
    "g-recaptcha-response": tokenInput(form, "g-recaptcha-response")?.value ?? "",
    "cf-turnstile-response": tokenInput(form, "cf-turnstile-response")?.value ?? "",
  };
}

export function PublicCaptcha({ locale }: { locale: "fr-FR" | "en-GB" }) {
  const rootRef = useRef<HTMLFieldSetElement>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const english = locale === "en-GB";

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const handleSubmit = (event: Event) => {
      const tokens = getPublicCaptchaTokens(form);
      if (!tokens["g-recaptcha-response"] || !tokens["cf-turnstile-response"]) {
        event.preventDefault();
        setMessage(english ? "Complete both anti-spam checks before submitting." : "Validez les deux contrôles anti-spam avant d’envoyer le formulaire.");
      }
    };
    form.addEventListener("submit", handleSubmit, true);
    return () => form.removeEventListener("submit", handleSubmit, true);
  }, [english]);

  useEffect(() => {
    if (!recaptchaSiteKey || !turnstileSiteKey) return;
    let cancelled = false;
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const setToken = (name: string, token: string) => {
      const input = tokenInput(form, name);
      if (input) input.value = token;
      setMessage("");
    };
    const clearToken = (name: string) => {
      const input = tokenInput(form, name);
      if (input) input.value = "";
    };
    if (recaptchaSiteKey && recaptchaRef.current) {
      void loadScript("google-recaptcha-script", "https://www.google.com/recaptcha/api.js?render=explicit")
        .then(() => { if (!cancelled && window.grecaptcha && recaptchaRef.current) window.grecaptcha.ready(() => { if (recaptchaRef.current && !recaptchaRef.current.dataset.widgetId) { const id = window.grecaptcha?.render(recaptchaRef.current, { sitekey: recaptchaSiteKey, callback: (token) => setToken("g-recaptcha-response", token), "expired-callback": () => clearToken("g-recaptcha-response"), "error-callback": () => clearToken("g-recaptcha-response") }); if (id !== undefined) recaptchaRef.current.dataset.widgetId = String(id); } }); })
        .catch(() => setMessage(english ? "The anti-spam checks could not be loaded." : "Les contrôles anti-spam n’ont pas pu être chargés."));
    }
    if (turnstileSiteKey && turnstileRef.current) {
      void loadScript("cloudflare-turnstile-script", "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit")
        .then(() => { if (!cancelled && window.turnstile && turnstileRef.current && !turnstileRef.current.dataset.widgetId) { const id = window.turnstile.render(turnstileRef.current, { sitekey: turnstileSiteKey, action: "public-form", callback: (token) => setToken("cf-turnstile-response", token), "expired-callback": () => clearToken("cf-turnstile-response"), "error-callback": () => clearToken("cf-turnstile-response") }); turnstileRef.current.dataset.widgetId = id; } })
        .catch(() => setMessage(english ? "The anti-spam checks could not be loaded." : "Les contrôles anti-spam n’ont pas pu être chargés."));
    }
    return () => { cancelled = true; };
  }, [english]);

  return <fieldset ref={rootRef} className="public-captcha" aria-describedby={message ? "public-captcha-error" : undefined}>
    <legend>{english ? "Anti-spam protection" : "Protection anti-spam"}</legend>
    <div className="public-captcha__checks">
      <div ref={recaptchaRef} className="public-captcha__recaptcha" aria-label={english ? "Google reCAPTCHA" : "Google reCAPTCHA"} />
      <div ref={turnstileRef} className="public-captcha__turnstile" aria-label="Cloudflare Turnstile" />
    </div>
    <input type="hidden" name="g-recaptcha-response" />
    <input type="hidden" name="cf-turnstile-response" />
    {message ? <small id="public-captcha-error" className="field-error" role="alert">{message}</small> : null}
  </fieldset>;
}

function publicForm(form: HTMLFormElement) {
  if (form.method.toLowerCase() === "dialog" || form.closest(".admin-body")) return false;
  const path = window.location.pathname;
  if (!/(contact|professionnel|professional|mon-compte|my-account|commande|checkout|activation|devis|quotes)/.test(path)) return false;
  const intent = form.querySelector<HTMLInputElement>("[name='intent']")?.value;
  return !intent || ["login", "register", "reset"].includes(intent);
}

export function PublicCaptchaMount() {
  useEffect(() => {
    if (!recaptchaSiteKey || !turnstileSiteKey) return;
    let cancelled = false;
    const decorate = (form: HTMLFormElement) => {
      if (cancelled || !publicForm(form) || form.querySelector("[data-public-captcha]")) return;
      const fieldset = document.createElement("fieldset");
      fieldset.dataset.publicCaptcha = "true";
      fieldset.className = "public-captcha";
      fieldset.innerHTML = `<legend>Protection anti-spam</legend><div class="public-captcha__checks"><div class="public-captcha__recaptcha"></div><div class="public-captcha__turnstile"></div></div><input type="hidden" name="g-recaptcha-response"><input type="hidden" name="cf-turnstile-response"><small class="field-error" role="alert" hidden></small>`;
      const submitter = form.querySelector("button[type='submit']");
      if (submitter) form.insertBefore(fieldset, submitter);
      else form.append(fieldset);
      const recaptcha = fieldset.querySelector<HTMLElement>(".public-captcha__recaptcha");
      const turnstile = fieldset.querySelector<HTMLElement>(".public-captcha__turnstile");
      const message = fieldset.querySelector<HTMLElement>(".field-error");
      const setToken = (name: string, token: string) => { tokenInput(form, name)!.value = token; if (message) message.hidden = true; };
      const clearToken = (name: string) => { tokenInput(form, name)!.value = ""; };
      form.addEventListener("submit", (event) => {
        const tokens = getPublicCaptchaTokens(form);
        if (!tokens["g-recaptcha-response"] || !tokens["cf-turnstile-response"]) {
          event.preventDefault();
          if (message) { message.hidden = false; message.textContent = "Veuillez valider les deux contrôles anti-spam avant d’envoyer le formulaire."; }
        }
      }, true);
      if (recaptchaSiteKey && recaptcha) void loadScript("google-recaptcha-script", "https://www.google.com/recaptcha/api.js?render=explicit").then(() => window.grecaptcha?.ready(() => { if (!recaptcha.dataset.widgetId) recaptcha.dataset.widgetId = String(window.grecaptcha?.render(recaptcha, { sitekey: recaptchaSiteKey, callback: (token) => setToken("g-recaptcha-response", token), "expired-callback": () => clearToken("g-recaptcha-response"), "error-callback": () => clearToken("g-recaptcha-response") })); }));
      if (turnstileSiteKey && turnstile) void loadScript("cloudflare-turnstile-script", "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit").then(() => { if (window.turnstile && !turnstile.dataset.widgetId) turnstile.dataset.widgetId = window.turnstile.render(turnstile, { sitekey: turnstileSiteKey, action: "public-form", callback: (token) => setToken("cf-turnstile-response", token), "expired-callback": () => clearToken("cf-turnstile-response"), "error-callback": () => clearToken("cf-turnstile-response") }); });
    };
    const scan = () => document.querySelectorAll<HTMLFormElement>("form").forEach(decorate);
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { cancelled = true; observer.disconnect(); };
  }, []);
  return null;
}
