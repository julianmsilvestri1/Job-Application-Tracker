import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, test, expect, beforeEach } from 'vitest';
import ApplicationDocuments from './ApplicationDocuments.jsx';
import { ToastProvider } from './Toaster.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getDocuments: vi.fn(),
    attachDocument: vi.fn(),
    detachDocument: vi.fn(),
    downloadUrl: (id) => `/api/documents/${id}/download`,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.getDocuments.mockResolvedValue([
    { id: 1, original_name: 'cv.pdf', type: 'resume', is_default: 1, label: '' },
  ]);
});

function renderWith(attached) {
  return render(
    <ToastProvider>
      <BrowserRouter>
        <ApplicationDocuments applicationId={1} attached={attached} onChanged={() => {}} />
      </BrowserRouter>
    </ToastProvider>,
  );
}

test('empty state offers attach controls', async () => {
  renderWith([]);
  expect(await screen.findByText('No documents linked to this application yet.')).toBeInTheDocument();
  expect(screen.getByText('Attach default resume')).toBeInTheDocument();
  expect(screen.getByText('Attach document')).toBeInTheDocument();
});

test('renders an attached document with its variant tag and label', async () => {
  renderWith([
    {
      document_id: 1, role: 'resume', variant_tag: 'analytics', label: 'Resume A',
      original_name: 'cv.pdf', extraction_status: 'done',
    },
  ]);
  expect(await screen.findByText('Resume A')).toBeInTheDocument();
  expect(screen.getByText('analytics')).toBeInTheDocument();
  expect(screen.getByText('Detach')).toBeInTheDocument();
});
