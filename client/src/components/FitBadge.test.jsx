import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test, expect } from 'vitest';
import FitBadge, { fitTier } from './FitBadge.jsx';

test('fitTier maps scores to tiers', () => {
  expect(fitTier(90)).toBe('strong');
  expect(fitTier(70)).toBe('good');
  expect(fitTier(50)).toBe('stretch');
  expect(fitTier(20)).toBe('low');
});

test('renders the score and expands reasons/gaps on click', async () => {
  render(<FitBadge fit={{ score: 87, reasons: ['Matches your skills: React'], gaps: ['Mentions Kubernetes'], source: 'ai' }} />);

  expect(screen.getByText('87% fit')).toBeInTheDocument();
  // Reasons hidden until expanded.
  expect(screen.queryByText('Matches your skills: React')).not.toBeInTheDocument();

  await userEvent.click(screen.getByText('87% fit'));
  expect(screen.getByText('Matches your skills: React')).toBeInTheDocument();
  expect(screen.getByText('Mentions Kubernetes')).toBeInTheDocument();
});

test('renders nothing without a numeric score', () => {
  const { container } = render(<FitBadge fit={null} />);
  expect(container).toBeEmptyDOMElement();
});
