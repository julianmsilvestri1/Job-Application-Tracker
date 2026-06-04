// Thin content script (Unit 2.5). The extension is a Trigger UI: it does NOT
// scrape, map, or fill the DOM — server-side Stagehand (Unit 2.4) performs all
// form intelligence and submission. This script only answers the popup's
// request for the current page location so the popup can show the host and pass
// the URL to /api/extension/trigger-apply.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  api?.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'GET_PAGE_INFO') {
      sendResponse({ url: location.href, hostname: location.hostname });
      return true;
    }
    return undefined;
  });
})();
