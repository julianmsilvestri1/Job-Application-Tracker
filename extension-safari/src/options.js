// Options page: configure the portal URL and test the connection.
import { getSettings, setSettings } from './shared/storage.js';
import { portal } from './shared/portalClient.js';
import { diagnoseConnection } from './shared/connection.js';

const $ = (id) => document.getElementById(id);

async function load() {
  const s = await getSettings();
  $('portalUrl').value = s.portalUrl || '';
  $('portalToken').value = s.portalToken || '';
}

function persist() {
  return setSettings({ portalUrl: $('portalUrl').value.trim(), portalToken: $('portalToken').value.trim() });
}

$('save').addEventListener('click', async () => {
  await persist();
  $('status').textContent = 'Saved.';
});

$('test').addEventListener('click', async () => {
  const url = $('portalUrl').value.trim();
  $('status').textContent = 'Testing…';
  try {
    await persist();
    await portal.testConnection();
    $('status').textContent = 'Connected ✓';
  } catch (e) {
    $('status').textContent = diagnoseConnection(url, e);
  }
});

load();
