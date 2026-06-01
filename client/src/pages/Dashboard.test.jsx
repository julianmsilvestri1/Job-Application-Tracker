import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, test, expect, beforeEach } from 'vitest';
import Dashboard from './Dashboard.jsx';
import { ToastProvider } from '../components/Toaster.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: { getStats: vi.fn(), getApplications: vi.fn(), getProviders: vi.fn() },
}));

beforeEach(() => {
  api.getStats.mockRejectedValue(new Error('stats failed'));
  api.getApplications.mockResolvedValue([]);
  api.getProviders.mockResolvedValue([]);
});

test('a failed load surfaces an error toast', async () => {
  render(
    <ToastProvider>
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    </ToastProvider>,
  );
  expect(await screen.findByText('stats failed')).toBeInTheDocument();
});
