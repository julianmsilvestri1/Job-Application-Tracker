import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';
import Search from './Search.jsx';
import { ToastProvider } from '../components/Toaster.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    assistantStatus: vi.fn(),
    getProviders: vi.fn(),
    searchJobs: vi.fn(),
    scoreJobs: vi.fn(),
    planQueries: vi.fn(),
    saveApplication: vi.fn(),
  },
}));

const jobs = [
  { source: 'remotive', externalId: '1', title: 'React Engineer', company: 'Acme', location: 'Remote', remote: true, description: 'React role', url: 'https://x/1', postedAt: '2026-01-02' },
  { source: 'remotive', externalId: '2', title: 'Diesel Mechanic', company: 'Trux', location: 'NY', description: 'Trucks', url: 'https://x/2', postedAt: '2026-01-03' },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.assistantStatus.mockResolvedValue({ aiEnabled: false });
  api.getProviders.mockResolvedValue([]);
  api.searchJobs.mockResolvedValue({ jobs, errors: [] });
  api.scoreJobs.mockResolvedValue({ scores: [
    { job_key: 'remotive:1', score: 92, reasons: ['Matches React'], gaps: [], source: 'heuristic' },
    { job_key: 'remotive:2', score: 8, reasons: [], gaps: ['No mechanical background'], source: 'heuristic' },
  ] });
});

function renderSearch() {
  return render(<ToastProvider><Search /></ToastProvider>);
}

test('search renders results, then Sort by fit scores and reorders', async () => {
  renderSearch();

  await userEvent.type(screen.getByPlaceholderText('e.g. frontend engineer'), 'engineer');
  await userEvent.click(screen.getByText('Search jobs'));

  await screen.findByText('React Engineer');
  expect(screen.getByText('Diesel Mechanic')).toBeInTheDocument();

  await userEvent.click(screen.getByText('☆ Sort by fit'));
  await waitFor(() => expect(api.scoreJobs).toHaveBeenCalled());
  await screen.findByText('92% fit');

  const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
  expect(titles.indexOf('React Engineer')).toBeLessThan(titles.indexOf('Diesel Mechanic'));
});

test('Improve my search expands queries and merges results', async () => {
  api.planQueries.mockResolvedValue({ queries: [{ query: 'react developer' }, { query: 'frontend engineer' }], rationale: 'wider net' });
  renderSearch();

  await userEvent.click(screen.getByText('✨ Improve my search'));
  await waitFor(() => expect(api.planQueries).toHaveBeenCalled());
  await waitFor(() => expect(api.searchJobs).toHaveBeenCalledTimes(2));
  await screen.findByText('React Engineer');
});
