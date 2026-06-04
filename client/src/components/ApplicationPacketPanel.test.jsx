import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, test, expect, beforeEach } from 'vitest';
import ApplicationPacketPanel from './ApplicationPacketPanel.jsx';
import { ToastProvider } from './Toaster.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: { getPacket: vi.fn(), triggerApply: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.getPacket.mockResolvedValue({
    candidate: { fields: [
      { label: 'Full name', value: 'Jane Doe', aliases: [], sensitivity: 'public' },
      { label: 'Email', value: 'jane@example.com', aliases: [], sensitivity: 'contact' },
    ] },
    documents: [{ documentId: 1, role: 'resume', label: 'Resume A', variantTag: 'analytics', downloadUrl: '/d/1' }],
    answers: [{ question: 'Why us?', answer: 'Because', source: 'ai' }],
    applyPolicy: { redactedFields: [] },
    retrievalScope: { resumeDocumentIds: [1], variantTags: ['analytics'] },
  });
  api.triggerApply.mockResolvedValue({
    hostname: 'greenhouse.io', filledCount: 3, skippedCount: 1, submitted: true,
    details: [{ label: 'Gender', action: 'skipped', reason: 'redacted' }],
  });
});

function renderWith(application = { url: 'https://x.com' }) {
  return render(
    <ToastProvider>
      <ApplicationPacketPanel applicationId={1} application={application} />
    </ToastProvider>,
  );
}

test('renders grouped candidate fields, documents, and answers', async () => {
  renderWith();
  expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
  expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  expect(screen.getByText(/Resume A/)).toBeInTheDocument();
  expect(screen.getByText('Why us?')).toBeInTheDocument();
  expect(screen.getByText('⚡ Apply for me')).toBeInTheDocument();
});

test('Apply for me triggers the backend and shows the run summary', async () => {
  renderWith();
  await screen.findByText('Jane Doe');
  fireEvent.click(screen.getByText('⚡ Apply for me'));
  await waitFor(() => expect(api.triggerApply).toHaveBeenCalledWith(1, 'https://x.com'));
  expect(await screen.findByText(/filled 3, skipped 1, submitted/)).toBeInTheDocument();
  expect(await screen.findByText(/Skipped: 1 sensitive\/EEO/)).toBeInTheDocument();
});
