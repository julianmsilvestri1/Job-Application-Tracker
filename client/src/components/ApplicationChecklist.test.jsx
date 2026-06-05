import { render, screen, fireEvent } from '@testing-library/react';
import { vi, test, expect, beforeEach } from 'vitest';
import ApplicationChecklist from './ApplicationChecklist.jsx';
import { ToastProvider } from './Toaster.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: { addTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.updateTask.mockResolvedValue({});
});

function renderWith(tasks, onChanged = () => {}) {
  return render(
    <ToastProvider>
      <ApplicationChecklist applicationId={1} tasks={tasks} onChanged={onChanged} />
    </ToastProvider>,
  );
}

test('shows progress and renders task labels', () => {
  renderWith([
    { id: 1, label: 'Submit', done: 0, category: 'apply', due_date: null },
    { id: 2, label: 'Follow up', done: 1, category: 'follow_up', due_date: null },
  ]);
  expect(screen.getByText('1/2 complete')).toBeInTheDocument();
  expect(screen.getByText('Submit')).toBeInTheDocument();
  expect(screen.getByText('Follow up')).toBeInTheDocument();
});

test('toggling a task calls updateTask with the flipped done flag', async () => {
  const onChanged = vi.fn();
  renderWith([{ id: 7, label: 'Submit', done: 0, category: 'apply', due_date: null }], onChanged);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(api.updateTask).toHaveBeenCalledWith(1, 7, { done: true });
});
