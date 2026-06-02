import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { vi, test, expect, beforeEach } from 'vitest';
import Profile from './Profile.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getProfile: vi.fn(),
    getDocuments: vi.fn(),
    getOrphanedAnswers: vi.fn(),
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    getPositioning: vi.fn(),
    updateExperience: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

const baseProfile = {
  full_name: '', headline: '', email: '', phone: '', location: '', years_experience: '',
  linkedin: '', github: '', website: '', desired_salary: '', work_authorization: '',
  needs_sponsorship: false, summary: '', skills: [], custom_fields: {},
};

function renderProfile() {
  return render(<BrowserRouter><Profile /></BrowserRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getProfile.mockResolvedValue({
    profile: baseProfile,
    experiences: [{ id: 5, title: 'Engineer', company: 'Acme', is_current: 0, start_date: '', end_date: '', location: '', description: '' }],
    education: [],
  });
  api.getDocuments.mockResolvedValue([]);
  api.getOrphanedAnswers.mockResolvedValue([]);
  api.getPreferences.mockResolvedValue({ titles: [], locations: [], keywords: [], remote_only: false, min_salary: '' });
  api.updatePreferences.mockResolvedValue({ titles: ['Backend Engineer'], locations: [], keywords: [], remote_only: false, min_salary: '' });
  api.getPositioning.mockResolvedValue({
    headlines: ['React Engineer who ships fast'], targetTitles: ['Frontend Engineer'],
    keywordStrategy: ['React', 'TypeScript'], summaryRewrite: 'I build great UIs.', source: 'heuristic',
  });
  api.updateExperience.mockResolvedValue({});
  api.updateProfile.mockResolvedValue(baseProfile);
});

test('edits an experience entry and calls the update API', async () => {
  renderProfile();

  await userEvent.click(await screen.findByText('Edit'));
  const titleInput = screen.getByDisplayValue('Engineer');
  await userEvent.clear(titleInput);
  await userEvent.type(titleInput, 'Senior Engineer');
  await userEvent.click(screen.getByText('Save'));

  await waitFor(() => expect(api.updateExperience).toHaveBeenCalled());
  expect(api.updateExperience).toHaveBeenCalledWith(5, expect.objectContaining({ title: 'Senior Engineer' }));
});

test('adding a job preference persists via updatePreferences', async () => {
  renderProfile();

  await screen.findByText('Job preferences');
  const input = screen.getByPlaceholderText('e.g. Frontend Engineer');
  await userEvent.type(input, 'Backend Engineer');
  // Scope to the "Target titles" form so we click its Add button, not Skills'.
  const form = input.closest('form');
  await userEvent.click(within(form).getByText('Add'));

  await waitFor(() => expect(api.updatePreferences).toHaveBeenCalled());
  expect(api.updatePreferences).toHaveBeenCalledWith(expect.objectContaining({ titles: ['Backend Engineer'] }));
});

test('positioning: suggest then apply a headline calls updateProfile', async () => {
  renderProfile();

  await userEvent.click(await screen.findByText('✨ Suggest positioning'));
  await screen.findByText('React Engineer who ships fast');
  expect(api.getPositioning).toHaveBeenCalled();

  // First "Use" button is the headline's.
  await userEvent.click(screen.getAllByText('Use')[0]);
  await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith(
    expect.objectContaining({ headline: 'React Engineer who ships fast' }),
  ));
});
