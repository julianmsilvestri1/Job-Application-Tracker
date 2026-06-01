import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';
import Profile from './Profile.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getProfile: vi.fn(),
    getDocuments: vi.fn(),
    updateExperience: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

const baseProfile = {
  full_name: '', headline: '', email: '', phone: '', location: '', years_experience: '',
  linkedin: '', github: '', website: '', desired_salary: '', work_authorization: '',
  needs_sponsorship: false, summary: '', skills: [], custom_fields: {},
};

beforeEach(() => {
  api.getProfile.mockResolvedValue({
    profile: baseProfile,
    experiences: [{ id: 5, title: 'Engineer', company: 'Acme', is_current: 0, start_date: '', end_date: '', location: '', description: '' }],
    education: [],
  });
  api.getDocuments.mockResolvedValue([]);
  api.updateExperience.mockResolvedValue({});
});

test('edits an experience entry and calls the update API', async () => {
  render(<Profile />);

  await userEvent.click(await screen.findByText('Edit'));
  const titleInput = screen.getByDisplayValue('Engineer');
  await userEvent.clear(titleInput);
  await userEvent.type(titleInput, 'Senior Engineer');
  await userEvent.click(screen.getByText('Save'));

  await waitFor(() => expect(api.updateExperience).toHaveBeenCalled());
  expect(api.updateExperience).toHaveBeenCalledWith(5, expect.objectContaining({ title: 'Senior Engineer' }));
});
