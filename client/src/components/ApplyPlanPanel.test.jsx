import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, test, expect, beforeEach } from 'vitest';
import ApplyPlanPanel from './ApplyPlanPanel.jsx';
import { ToastProvider } from './Toaster.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: { generateApplyPlan: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.generateApplyPlan.mockResolvedValue({ source: 'template', requirements: [], suggested_tasks: [], mergedTaskCount: 0 });
});

function renderWith(plan) {
  return render(
    <ToastProvider>
      <ApplyPlanPanel applicationId={1} plan={plan} aiEnabled={false} onChanged={() => {}} />
    </ToastProvider>,
  );
}

test('empty state offers to generate a plan', () => {
  renderWith(null);
  expect(screen.getByText('No apply plan generated yet.')).toBeInTheDocument();
  expect(screen.getByText('Suggest apply plan')).toBeInTheDocument();
});

test('renders a generated plan with its sections and task-merge action', () => {
  renderWith({
    source: 'ai',
    requirements: ['Cover letter'],
    likely_questions: ['Why us?'],
    warnings: ['Clearance required'],
    suggested_tasks: [{ label: 'Tailor resume', category: 'document' }],
  });
  expect(screen.getByText('Cover letter')).toBeInTheDocument();
  expect(screen.getByText('Why us?')).toBeInTheDocument();
  expect(screen.getByText('Clearance required')).toBeInTheDocument();
  expect(screen.getByText('Add suggested tasks')).toBeInTheDocument();
  expect(screen.getByText('↻ Regenerate plan')).toBeInTheDocument();
});

test('clicking Suggest apply plan calls the API', async () => {
  renderWith(null);
  fireEvent.click(screen.getByText('Suggest apply plan'));
  await waitFor(() => expect(api.generateApplyPlan).toHaveBeenCalledWith(1, { refresh: true, mergeTasks: false }));
});
