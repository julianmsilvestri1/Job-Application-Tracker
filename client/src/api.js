// Thin fetch wrapper around the backend API.
const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : undefined,
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  // Profile
  getProfile: () => request('/profile'),
  updateProfile: (body) => request('/profile', { method: 'PUT', body: JSON.stringify(body) }),
  addExperience: (b) => request('/profile/experiences', { method: 'POST', body: JSON.stringify(b) }),
  updateExperience: (id, b) => request(`/profile/experiences/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  deleteExperience: (id) => request(`/profile/experiences/${id}`, { method: 'DELETE' }),
  addEducation: (b) => request('/profile/education', { method: 'POST', body: JSON.stringify(b) }),
  updateEducation: (id, b) => request(`/profile/education/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  deleteEducation: (id) => request(`/profile/education/${id}`, { method: 'DELETE' }),

  // Documents
  getDocuments: () => request('/documents'),
  uploadDocument: (formData) => request('/documents', { method: 'POST', body: formData }),
  setDefaultDocument: (id) => request(`/documents/${id}/default`, { method: 'PUT' }),
  deleteDocument: (id) => request(`/documents/${id}`, { method: 'DELETE' }),
  downloadUrl: (id) => `${BASE}/documents/${id}/download`,

  // Jobs
  getProviders: () => request('/jobs/providers'),
  searchJobs: (params) => request(`/jobs/search?${new URLSearchParams(params)}`),

  // Applications
  getApplications: (status) => request(`/applications${status ? `?status=${status}` : ''}`),
  getStats: () => request('/applications/stats'),
  saveApplication: (b) => request('/applications', { method: 'POST', body: JSON.stringify(b) }),
  updateApplication: (id, b) => request(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteApplication: (id) => request(`/applications/${id}`, { method: 'DELETE' }),

  // Assistant
  assistantStatus: () => request('/assistant/status'),
  getAutofill: () => request('/assistant/autofill'),
  generateCoverLetter: (b) => request('/assistant/cover-letter', { method: 'POST', body: JSON.stringify(b) }),
  answerQuestion: (b) => request('/assistant/answer', { method: 'POST', body: JSON.stringify(b) }),
};
