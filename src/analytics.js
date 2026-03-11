const DEBUG_PREFIX = "[analytics]";
const hasWindow = typeof window !== "undefined";
const measurementId = hasWindow ? "G-HKTW6SB3QT" : "";

function ensureDataLayer() {
  if (!hasWindow) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };
}

function injectGtag(id) {
  if (!hasWindow || !id || document.querySelector(`script[data-ga-id="${id}"]`)) {
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  script.dataset.gaId = id;
  document.head.appendChild(script);
}

function sanitizeParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
}

export function initAnalytics() {
  if (!hasWindow) {
    return;
  }

  ensureDataLayer();

  if (!measurementId) {
    console.info(`${DEBUG_PREFIX} GA4 disabled.`);
    return;
  }

  injectGtag(measurementId);
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    anonymize_ip: true,
    send_page_view: true
  });
}

export function trackEvent(name, params = {}, options = {}) {
  if (!hasWindow) {
    return;
  }

  const payload = sanitizeParams(params);

  if (!measurementId) {
    console.info(DEBUG_PREFIX, name, payload);
    return;
  }

  ensureDataLayer();

  if (options.transport === "beacon") {
    payload.transport_type = "beacon";
  }

  window.gtag("event", name, payload);
}
