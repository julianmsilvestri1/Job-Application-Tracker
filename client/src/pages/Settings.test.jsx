import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, test, expect, beforeEach } from 'vitest';
import Settings from './Settings.jsx';
import { ToastProvider } from '../components/Toaster.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: { getApplyPolicy: vi.fn(), updateApplyPolicy: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.getApplyPolicy.mockResolvedValue({
    canSubmit: false, fillExisting: false, includeCustomFields: true,
    sensitiveDenylist: ['SSN', 'Gender'], extensionVersion: '0.2.0',
  });
  api.updateApplyPolicy.mockResolvedValue({
    canSubmit: true, fillExisting: false, includeCustomFields: true,
    sensitiveDenylist: ['SSN', 'Gender'], extensionVersion: '0.2.0',
  });
});

function renderPage() {
  return render(<ToastProvider><Settings /></ToastProvider>);
}

test('shows the safe defaults and the sensitive denylist', async () => {
  renderPage();
  expect(await screen.findByText('Auto-submit applications')).toBeInTheDocument();
  expect(screen.getByText(/Never auto-filled:/)).toBeInTheDocument();
  expect(screen.getByText(/SSN, Gender/)).toBeInTheDocument();
  // auto-submit checkbox is off by default
  const autoSubmit = screen.getAllByRole('checkbox')[0];
  expect(autoSubmit).not.toBeChecked();
});

test('enabling auto-submit calls the policy API', async () => {
  renderPage();
  await screen.findByText('Auto-submit applications');
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  await waitFor(() => expect(api.updateApplyPolicy).toHaveBeenCalledWith({ autoSubmit: true }));
});
