// Pont entre la page ScrollShow et l'extension. La page ne connait pas
// l'identifiant de l'extension : elle parle par window.postMessage, ce script
// relaie au script de fond, et renvoie l'avancement.
(() => {
  const VERSION = chrome.runtime.getManifest().version;
  const toPage = (message) => window.postMessage({ source: "scrollshow-ext", ...message }, location.origin);
  const announce = () => toPage({ type: "ready", version: VERSION });

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "scrollshow-web") return;
    if (event.data.type === "ping") return announce();
    if (event.data.type === "collect" && /^[0-9a-f-]{36}$/i.test(String(event.data.jobId || ""))) {
      chrome.runtime.sendMessage({ type: "collect", jobId: event.data.jobId, origin: location.origin }, (reply) => {
        if (chrome.runtime.lastError) toPage({ type: "error", jobId: event.data.jobId, error: "extension_unreachable" });
        else if (reply && reply.error) toPage({ type: "error", jobId: event.data.jobId, error: reply.error });
      });
    }
  });
  chrome.runtime.onMessage.addListener((message) => { if (message && message.forPage) toPage(message.forPage); });
  announce();
  document.addEventListener("DOMContentLoaded", announce);
})();
