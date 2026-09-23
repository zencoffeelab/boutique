import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// A Turnstile sitekey is intentionally public: its matching secret stays in
// the Worker configuration and is only used for server-side verification.
const turnstileSiteKey = "0x4AAAAAAFBOBLKufuglALgL";

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

function tokenInput(form: HTMLFormElement) {
  return form.elements.namedItem("cf-turnstile-response") as HTMLInputElement | null;
}

export function getPublicCaptchaToken(form: HTMLFormElement) {
  return tokenInput(form)?.value ?? "";
}

function formAction(form: HTMLFormElement) {
  if (form.method.toLowerCase() === "dialog" || form.closest(".admin-body")) return false;
  // Professional selections use the required approved-account session and a
  // dedicated server-side rate limit instead of a public CAPTCHA widget.
  if (form.querySelector("input[name='intent'][value='professional-selection']")) return false;
  return /contact/.test(window.location.pathname) ? "contact" : false;
}

function addTurnstile(form: HTMLFormElement, action: string, fieldset: HTMLElement, message: HTMLElement | null) {
  const turnstile = fieldset.querySelector<HTMLElement>(".public-captcha__turnstile");
  if (!turnstile) return;
  const setToken = (token: string) => {
    const input = tokenInput(form);
    if (input) input.value = token;
    if (message) message.hidden = true;
  };
  const clearToken = () => {
    const input = tokenInput(form);
    if (input) input.value = "";
  };
  void loadScript("cloudflare-turnstile-script", "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit")
    .then(() => {
      if (window.turnstile && !turnstile.dataset.widgetId) {
        turnstile.dataset.widgetId = window.turnstile.render(turnstile, {
          sitekey: turnstileSiteKey,
          action,
          callback: setToken,
          "expired-callback": clearToken,
          "error-callback": clearToken,
        });
      }
    })
    .catch(() => {
      if (message) {
        message.hidden = false;
        message.textContent = "Le contr\u00f4le anti-spam n\u2019a pas pu \u00eatre charg\u00e9.";
      }
    });
}

export function PublicCaptcha({ locale }: { locale: "fr-FR" | "en-GB" }) {
  const rootRef = useRef<HTMLFieldSetElement>(null);
  const [message, setMessage] = useState("");
  const english = locale === "en-GB";

  useEffect(() => {
    const fieldset = rootRef.current;
    const form = fieldset?.closest("form");
    if (!fieldset || !form) return;
    const handleSubmit = (event: Event) => {
      if (!getPublicCaptchaToken(form)) {
        event.preventDefault();
        setMessage(english ? "Complete the anti-spam check before submitting." : "Validez le contr\u00f4le anti-spam avant d\u2019envoyer le formulaire.");
      }
    };
    form.addEventListener("submit", handleSubmit, true);
    addTurnstile(form, "contact", fieldset, null);
    return () => form.removeEventListener("submit", handleSubmit, true);
  }, [english]);

  return <fieldset ref={rootRef} data-public-captcha="true" className="public-captcha" aria-describedby={message ? "public-captcha-error" : undefined}>
    <legend>{english ? "Anti-spam protection" : "Protection anti-spam"}</legend>
    <div className="public-captcha__checks">
      <div className="public-captcha__turnstile" aria-label="Cloudflare Turnstile" />
    </div>
    <input type="hidden" name="cf-turnstile-response" />
    {message ? <small id="public-captcha-error" className="field-error" role="alert">{message}</small> : null}
  </fieldset>;
}

export function PublicCaptchaMount() {
  useEffect(() => {
    let cancelled = false;
    const decorate = (form: HTMLFormElement) => {
      const action = formAction(form);
      if (cancelled || !action || form.querySelector("[data-public-captcha]")) return;
      const fieldset = document.createElement("fieldset");
      fieldset.dataset.publicCaptcha = "true";
      fieldset.className = "public-captcha";
      fieldset.innerHTML = `<legend>Protection anti-spam</legend><div class="public-captcha__checks"><div class="public-captcha__turnstile"></div></div><input type="hidden" name="cf-turnstile-response"><small class="field-error" role="alert" hidden></small>`;
      const submitter = form.querySelector("button[type='submit']");
      if (submitter) form.insertBefore(fieldset, submitter);
      else form.append(fieldset);
      const message = fieldset.querySelector<HTMLElement>(".field-error");
      form.addEventListener("submit", (event) => {
        if (!getPublicCaptchaToken(form)) {
          event.preventDefault();
          if (message) {
            message.hidden = false;
            message.textContent = "Validez le contr\u00f4le anti-spam avant d\u2019envoyer le formulaire.";
          }
        }
      }, true);
      addTurnstile(form, action, fieldset, message);
    };
    const scan = () => document.querySelectorAll<HTMLFormElement>("form").forEach(decorate);
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);
  return null;
}
