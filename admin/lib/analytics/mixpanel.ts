import mixpanel from "mixpanel-browser";

const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || "";
const isProduction = process.env.NODE_ENV === "production";

let isInitialized = false;

export function initMixpanel(): void {
  // Don't initialize if not production, already initialized, no window, or no token
  if (!isProduction || isInitialized || typeof window === "undefined" || !MIXPANEL_TOKEN) {
    return;
  }

  try {
    mixpanel.init(MIXPANEL_TOKEN, {
      autocapture: true,
      // Session Replay settings
      record_sessions_percent: 100,
      record_collect_fonts: true,
      record_idle_timeout_ms: 1800000, // 30 minutes idle timeout
      record_mask_text_selector: "input[type=password]", // Mask password fields
      api_host: "https://api-eu.mixpanel.com",
    });

    isInitialized = true;
  } catch (error) {
    console.error("Failed to initialize Mixpanel:", error);
  }
}

export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>
): void {
  if (!isInitialized) return;
  try {
    mixpanel.track(eventName, properties);
  } catch (error) {
    console.error("Mixpanel trackEvent error:", error);
  }
}

export function identifyUser(
  userId: string,
  userProperties?: Record<string, unknown>
): void {
  if (!isInitialized) return;
  try {
    mixpanel.identify(userId);
    if (userProperties) {
      mixpanel.people.set(userProperties);
    }
  } catch (error) {
    console.error("Mixpanel identifyUser error:", error);
  }
}

export function resetUser(): void {
  if (!isInitialized) return;
  try {
    mixpanel.reset();
  } catch (error) {
    console.error("Mixpanel resetUser error:", error);
  }
}

export function setUserProperties(properties: Record<string, unknown>): void {
  if (!isInitialized) return;
  try {
    mixpanel.people.set(properties);
  } catch (error) {
    console.error("Mixpanel setUserProperties error:", error);
  }
}

export function incrementUserProperty(
  property: string,
  value: number = 1
): void {
  if (!isInitialized) return;
  try {
    mixpanel.people.increment(property, value);
  } catch (error) {
    console.error("Mixpanel incrementUserProperty error:", error);
  }
}

export function trackPageView(pageName?: string): void {
  if (!isInitialized) return;
  try {
    mixpanel.track("Page View", {
      page: pageName || window.location.pathname,
      url: window.location.href,
      referrer: document.referrer,
    });
  } catch (error) {
    console.error("Mixpanel trackPageView error:", error);
  }
}

