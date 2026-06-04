// Toolbar popup (Trigger UI). Lists saved applications from the portal, previews
// the selected packet, copies fields/answers, and triggers server-side apply.
// It never fills the page — submission happens in the backend Stagehand service.
import { portal } from './shared/portalClient.js';
import { previewSummary, fieldsToText, answersToText } from './shared/packetView.js';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const setStatus = (msg, kind = '') => { const el = $('status'); el.textContent = msg; el.className = kind; };

const current = { tab: null, page: { url: '', hostname: '' }, packet: null };

async function activeTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function pageInfo(tab) {
  const fallback = () => { try { return { url: tab.url, hostname: new URL(tab.url).hostname }; } catch { return { url: tab?.url || '', hostname: '' }; } };
  try {
    const info = await api.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' });
    return info || fallback();
  } catch {
    return fallback();
  }
}

async function loadPacket(id) {
  setStatus('Loading packet…');
  try {
    current.packet = await portal.getPacket(id);
    $('preview').textContent = previewSummary(current.packet);
    setStatus('');
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

function copy(text) {
  navigator.clipboard?.writeText(text);
  setStatus('Copied', 'ok');
}

async function showPolicy() {
  try {
    const p = await portal.applyPolicy();
    $('policy').textContent = p.canSubmit
      ? 'Auto-submit: ON — submits only complete, verified forms.'
      : 'Auto-submit: OFF — fills only; you review & submit.';
  } catch { /* policy is advisory in the popup; ignore */ }
}

async function init() {
  current.tab = await activeTab();
  current.page = await pageInfo(current.tab);
  $('host').textContent = current.page.hostname || '(unknown page)';
  showPolicy();
  try {
    const apps = await portal.listApplications();
    const sel = $('app');
    sel.innerHTML = '';
    if (!apps.length) {
      sel.disabled = true;
      setStatus('No saved applications yet — save jobs in the portal first.');
      return;
    }
    for (const a of apps) {
      const o = document.createElement('option');
      o.value = a.id;
      o.textContent = `${a.title || '(untitled)'} — ${a.company || ''}`.trim();
      sel.appendChild(o);
    }
    await loadPacket(apps[0].id);
  } catch (e) {
    setStatus(`${e.message} — set the portal URL in Options.`, 'error');
  }
}

$('app').addEventListener('change', (e) => loadPacket(Number(e.target.value)));
$('copyFields').addEventListener('click', () => {
  if (current.packet) copy(fieldsToText(current.packet));
});
$('copyAnswers').addEventListener('click', () => {
  if (current.packet) copy(answersToText(current.packet));
});
$('apply').addEventListener('click', async () => {
  if (!current.packet) return;
  setStatus('Applying via portal…');
  try {
    const r = await portal.triggerApply(Number($('app').value), current.page.url);
    setStatus(`${r.hostname}: filled ${r.filledCount}, skipped ${r.skippedCount}${r.submitted ? ', submitted ✓' : ''}`, 'ok');
  } catch (e) {
    setStatus(e.message, 'error');
  }
});
$('options').addEventListener('click', () => api.runtime.openOptionsPage());

init();
