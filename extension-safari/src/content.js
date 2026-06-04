// Content script (Unit 2.5 thin Trigger UI + 2.5b iPad inline review).
//
// The extension never scrapes, maps, or fills the page DOM — server-side
// Stagehand (Unit 2.4) does that. This script only:
//   1) answers the popup's GET_PAGE_INFO with the page URL/host, and
//   2) on a detected apply page, offers an OPTIONAL inline review panel for
//      iPad (where reaching the toolbar popup is awkward): select a saved
//      application, preview/copy the packet, and trigger server-side apply.
//
// The UI is mounted in a shadow root so page CSS can't affect it (or vice
// versa). All data/formatting comes from the shared, unit-tested modules.
import { portal } from './shared/portalClient.js';
import { previewSummary, fieldsToText, answersToText } from './shared/packetView.js';
import { isApplyPage, atsLabel } from './shared/applyTargets.js';

const api = globalThis.browser ?? globalThis.chrome;

// 1) Page-info channel for the popup.
api?.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'GET_PAGE_INFO') {
    sendResponse({ url: location.href, hostname: location.hostname });
    return true;
  }
  return undefined;
});

// 2) Optional inline review.
const DISMISS_KEY = 'jobapply-review-dismissed';
const dismissed = () => { try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } };
const setDismissed = () => { try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ } };

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

const STYLE = `
  :host { all: initial; }
  .wrap { position: fixed; right: 12px; bottom: 12px; z-index: 2147483647;
    font: 15px -apple-system, system-ui, sans-serif; color: #1a1a1a; }
  .card { background: #fff; border: 1px solid #dcdce5; border-radius: 14px;
    box-shadow: 0 8px 30px rgba(0,0,0,.18); width: min(360px, 92vw);
    max-height: 70vh; overflow-y: auto; padding: 14px; }
  .banner { display: flex; align-items: center; gap: 10px; }
  .banner b { font-size: 15px; }
  .grow { flex: 1; }
  .muted { color: #666; font-size: 13px; }
  select { width: 100%; min-height: 44px; padding: 8px; margin: 10px 0 8px;
    font-size: 15px; border: 1px solid #cfcfda; border-radius: 10px; }
  .row { display: flex; gap: 8px; margin-top: 8px; }
  button { min-height: 44px; padding: 10px 12px; border: 0; border-radius: 10px;
    background: #eef; color: #234; font-weight: 600; font-size: 15px; cursor: pointer; flex: 1; }
  button.primary { background: #4f7cff; color: #fff; }
  button.icon { flex: 0 0 auto; min-width: 44px; background: none; color: #888; font-size: 18px; }
  .status { margin-top: 8px; font-size: 13px; min-height: 18px; color: #666; }
  .status.error { color: #c0392b; }
  .status.ok { color: #1e8e4e; }
`;

function mount() {
  if (document.getElementById('jobapply-root')) return;
  const host = h('div', { id: 'jobapply-root' });
  (document.body || document.documentElement).append(host);
  const root = host.attachShadow({ mode: 'open' });
  // adoptedStyleSheets avoids inline-<style> CSP issues on strict pages.
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLE);
    root.adoptedStyleSheets = [sheet];
  } catch {
    root.append(h('style', { text: STYLE }));
  }
  const wrap = h('div', { class: 'wrap' });
  root.append(wrap);
  renderBanner(wrap);
}

function renderBanner(wrap) {
  const review = h('button', { class: 'primary', style: 'flex:0 0 auto', text: 'Review & autofill', onClick: () => renderPanel(wrap) });
  const close = h('button', { class: 'icon', title: 'Dismiss', text: '✕', onClick: () => { setDismissed(); wrap.remove(); } });
  wrap.replaceChildren(h('div', { class: 'card' },
    h('div', { class: 'banner' },
      h('b', { text: '⚡ Job Apply' }),
      h('span', { class: 'grow muted', text: atsLabel(location.href) }),
      review, close)));
}

function renderPanel(wrap) {
  const select = h('select', { 'aria-label': 'Application' });
  const summary = h('div', { class: 'muted', text: 'Loading…' });
  const status = h('div', { class: 'status' });
  const setStatus = (m, kind = '') => { status.textContent = m; status.className = `status ${kind}`; };

  const state = { packet: null };
  async function load(id) {
    setStatus('Loading packet…');
    try { state.packet = await portal.getPacket(id); summary.textContent = previewSummary(state.packet); setStatus(''); }
    catch (e) { setStatus(e.message, 'error'); }
  }
  const copy = (t) => { navigator.clipboard?.writeText(t); setStatus('Copied', 'ok'); };

  const card = h('div', { class: 'card' },
    h('div', { class: 'banner' },
      h('b', { text: 'Job Apply' }),
      h('span', { class: 'grow muted', text: atsLabel(location.href) }),
      h('button', { class: 'icon', title: 'Close', text: '✕', onClick: () => { setDismissed(); wrap.remove(); } })),
    select, summary,
    h('div', { class: 'row' },
      h('button', { text: 'Copy fields', onClick: () => state.packet && copy(fieldsToText(state.packet)) }),
      h('button', { text: 'Copy answers', onClick: () => state.packet && copy(answersToText(state.packet)) })),
    h('div', { class: 'row' },
      h('button', { class: 'primary', text: '⚡ Apply for me', onClick: async () => {
        if (!state.packet) return;
        setStatus('Applying via portal…');
        try {
          const r = await portal.triggerApply(Number(select.value), location.href);
          setStatus(`filled ${r.filledCount}, skipped ${r.skippedCount}${r.submitted ? ', submitted ✓' : ''}`, 'ok');
        } catch (e) { setStatus(e.message, 'error'); }
      } })),
    status);
  wrap.replaceChildren(card);

  select.addEventListener('change', () => load(Number(select.value)));
  (async () => {
    try {
      const apps = await portal.listApplications();
      if (!apps.length) { summary.textContent = ''; setStatus('No saved applications — save jobs in the portal first.'); return; }
      for (const a of apps) select.append(h('option', { value: String(a.id), text: `${a.title || '(untitled)'} — ${a.company || ''}`.trim() }));
      await load(apps[0].id);
    } catch (e) {
      summary.textContent = '';
      setStatus(`${e.message} — set the portal URL in the extension options.`, 'error');
    }
  })();
}

if (isApplyPage(location.href) && !dismissed()) {
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}
