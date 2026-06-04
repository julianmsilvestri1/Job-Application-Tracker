import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    getDocuments: vi.fn(),
    attachDocument: vi.fn(),
    detachDocument: vi.fn(),
    downloadUrl: (id) => `/api/documents/${id}/download`,
    getPacket: vi.fn(),
    triggerApply: vi.fn(),
    markSubmitted: vi.fn(),
    clearReview: vi.fn(),
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
  api.getDocuments.mockResolvedValue([]);
  api.getPacket.mockResolvedValue({
    candidate: { fields: [] }, documents: [], answers: [],
    applyPolicy: { redactedFields: [] }, retrievalScope: { resumeDocumentIds: [], variantTags: [] },
  });
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

test('"Mark submitted" calls the API', async () => {
  api.markSubmitted.mockResolvedValue({
    id: 1, title: 'Frontend Engineer', company: 'Globex', status: 'applied',
    documents: [], tasks: [], answers: [], events: [], applyPlan: null,
  });
  render(
    <ToastProvider>
      <BrowserRouter>
        <ApplicationWorkspace applicationId={1} aiEnabled={false} onBack={() => {}} />
      </BrowserRouter>
    </ToastProvider>,
  );
  fireEvent.click(await screen.findByText('✅ Mark submitted'));
  await waitFor(() => expect(api.markSubmitted).toHaveBeenCalledWith(1));
});

test('shows a review banner when flagged and "Clear flag" calls the API', async () => {
  api.getApplication.mockResolvedValue({
    id: 1, title: 'Frontend Engineer', company: 'Globex', status: 'saved',
    notes: '', cover_letter: '', remote: false,
    needs_review: true, review_summary: 'Auto-apply paused: 1 field(s) did not verify after fill.',
    documents: [], tasks: [], answers: [], events: [], applyPlan: null,
  });
  api.clearReview.mockResolvedValue({});
  render(
    <ToastProvider>
      <BrowserRouter>
        <ApplicationWorkspace applicationId={1} aiEnabled={false} onBack={() => {}} />
      </BrowserRouter>
    </ToastProvider>,
  );
  expect(await screen.findByText(/did not verify after fill/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Clear flag'));
  await waitFor(() => expect(api.clearReview).toHaveBeenCalledWith(1));
});
