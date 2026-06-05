import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, test, expect, beforeEach } from 'vitest';
import ApplicationWorkspace from './ApplicationWorkspace.jsx';
import { ToastProvider } from './Toaster.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getApplication: vi.fn(),
    updateApplication: vi.fn(),
    getAnswers: vi.fn(),
    generateCoverLetter: vi.fn(),
    answerQuestion: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.getApplication.mockResolvedValue({
    id: 1, title: 'Frontend Engineer', company: 'Globex', status: 'saved',
    notes: '', cover_letter: '', remote: false,
    documents: [], tasks: [], answers: [], events: [], applyPlan: null,
  });
  api.getAnswers.mockResolvedValue([]);
});

test('workspace renders the fixed sections for a loaded application', async () => {
  render(
    <ToastProvider>
      <BrowserRouter>
        <ApplicationWorkspace applicationId={1} aiEnabled={false} onBack={() => {}} />
      </BrowserRouter>
    </ToastProvider>,
  );

  expect(await screen.findByText('Frontend Engineer')).toBeInTheDocument();
  expect(screen.getByText('Overview')).toBeInTheDocument();
  expect(screen.getByText(/^Documents/)).toBeInTheDocument();
  expect(screen.getByText(/^Checklist/)).toBeInTheDocument();
  expect(screen.getByText('Apply plan')).toBeInTheDocument();
  expect(screen.getByText('Packet')).toBeInTheDocument();
  expect(screen.getByText('Assistant')).toBeInTheDocument();
  expect(screen.getByText(/^Activity/)).toBeInTheDocument();
});
