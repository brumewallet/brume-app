// Opt-in product analytics and session replay (PostHog).
//
// Nothing is sent until the user opts in. Events never carry wallet
// addresses, amounts, signatures, or key material. Screens that show
// secrets carry the `ph-no-capture` class, so replay does not record them.
//
// The no-external bundle contains the recorder, so the extension does not
// load remote code (MV3 rule).
import posthog from "posthog-js/dist/module.full.no-external";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = "https://us.i.posthog.com";

const CONSENT_KEY = "brume_analytics_consent";
const FIRST_OPEN_KEY = "brume_first_open_at";

/** Add to the root of any screen that shows a seed phrase, key, or password. */
export const NO_CAPTURE_CLASS = "ph-no-capture";

export type AnalyticsConsent = "granted" | "denied";

let started = false;
let network: string | null = null;

export function analyticsAvailable(): boolean {
  return !!POSTHOG_KEY;
}

export async function readConsent(): Promise<AnalyticsConsent | null> {
  const raw = await chrome.storage.local.get(CONSENT_KEY);
  const v = raw[CONSENT_KEY];
  return v === "granted" || v === "denied" ? v : null;
}

async function readFirstOpenAt(): Promise<number> {
  const raw = await chrome.storage.local.get(FIRST_OPEN_KEY);
  const v = raw[FIRST_OPEN_KEY];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const now = Date.now();
  await chrome.storage.local.set({ [FIRST_OPEN_KEY]: now });
  return now;
}

// Drop query strings and hash params: routes such as /send/success?sig=…
// would otherwise link a session to an on-chain transaction.
function stripUrl(u: unknown): unknown {
  if (typeof u !== "string") return u;
  return u.replace(/\?[^#]*/g, "").replace(/(#[^?]*)\?.*$/, "$1");
}

function start(firstOpenAt: number): void {
  if (started || !POSTHOG_KEY) return;
  started = true;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    persistence: "localStorage",
    disable_external_dependency_loading: true,
    person_profiles: "always",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    save_referrer: false,
    session_recording: {
      maskAllInputs: true,
      blockClass: NO_CAPTURE_CLASS,
    },
    before_send: (event) => {
      if (!event) return event;
      const p = event.properties;
      if (p) {
        for (const k of ["$current_url", "$pathname", "$referrer", "$initial_current_url"]) {
          if (k in p) p[k] = stripUrl(p[k]);
        }
      }
      return event;
    },
  });
  posthog.register({
    surface: document.documentElement.classList.contains("brume-shell-popup")
      ? "popup"
      : "sidepanel",
    extension_version: chrome.runtime.getManifest().version,
    ...(network ? { network } : {}),
  });
  posthog.setPersonProperties(undefined, {
    first_open_at: new Date(firstOpenAt).toISOString(),
  });
  posthog.capture("app_opened");
}

/** Call once at popup start. Records first open; starts PostHog only if consent was given. */
export async function initAnalytics(): Promise<void> {
  const firstOpenAt = await readFirstOpenAt();
  if ((await readConsent()) === "granted") start(firstOpenAt);
}

export async function setConsent(consent: AnalyticsConsent): Promise<void> {
  await chrome.storage.local.set({ [CONSENT_KEY]: consent });
  if (consent === "granted") {
    if (started) {
      posthog.opt_in_capturing();
      posthog.startSessionRecording();
    } else {
      start(await readFirstOpenAt());
    }
    posthog.capture("analytics_opted_in");
    return;
  }
  if (started) {
    posthog.stopSessionRecording();
    posthog.opt_out_capturing();
    posthog.reset();
  }
}

export function setNetwork(next: string): void {
  network = next;
  if (started) posthog.register({ network });
}

type Props = Record<string, string | number | boolean | null>;

/** Activation events are sent at once: the popup can close right after. */
export function track(event: string, props?: Props): void {
  if (!started) return;
  posthog.capture(event, props, { send_instantly: true });
}
