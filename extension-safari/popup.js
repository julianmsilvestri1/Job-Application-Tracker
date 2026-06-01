// Toolbar popup: ask the content script to autofill the active tab.
document.getElementById('fill').addEventListener('click', async () => {
  const status = document.getElementById('status');
  status.textContent = 'Filling…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'AUTOFILL' });
    status.textContent = `Filled ${res?.filled ?? 0} field(s). Review before submitting.`;
  } catch (e) {
    status.textContent = 'Could not autofill this page.';
  }
});
