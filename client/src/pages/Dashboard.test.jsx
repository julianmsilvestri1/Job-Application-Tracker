import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, test, expect, beforeEach } from 'vitest';
import Dashboard from './Dashboard.jsx';
import { ToastProvider } from '../components/Toaster.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getStats: vi.fn(),
    getApplications: vi.fn(),
    getProviders: vi.fn(),
    getRecommended: vi.fn(),
    assistantStatus: vi.fn(),
    saveApplication: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.getStats.mockRejectedValue(new Error('stats failed'));
  api.getApplications.mockResolvedValue([]);
  api.getProviders.mockResolvedValue([]);
  api.getRecommended.mockResolvedValue({ jobs: [], derivedFrom: 'profile' });
  api.assistantStatus.mockResolvedValue({ aiEnabled: false });
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

test('renders the Recommended for you section', async () => {
  render(
    <ToastProvider>
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    </ToastProvider>,
  );
  expect(await screen.findByText('Recommended for you')).toBeInTheDocument();
});
