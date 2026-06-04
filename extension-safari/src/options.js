// Options page: configure the portal URL and test the connection.
import { getSettings, setSettings } from './shared/storage.js';
import { portal } from './shared/portalClient.js';

const $ = (id) => document.getElementById(id);

async function load() {
  const s = await getSettings();
  $('portalUrl').value = s.portalUrl || '';
}

$('save').addEventListener('click', async () => {
  await setSettings({ portalUrl: $('portalUrl').value.trim() });
  $('status').textContent = 'Saved.';
});

$('test').addEventListener('click', async () => {
  $('status').textContent = 'Testing…';
  try {
    await setSettings({ portalUrl: $('portalUrl').value.trim() });
    await portal.testConnection();
    $('status').textContent = 'Connected ✓';
  } catch (e) {
    $('status').textContent = `Failed: ${e.message}`;
  }
});

load();
