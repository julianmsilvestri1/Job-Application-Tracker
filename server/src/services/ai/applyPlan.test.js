import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { heuristicApplyPlan } from './heuristics.js';
import { applyPlan, clearAiCache } from './orchestrator.js';

const realKey = process.env.ANTHROPIC_API_KEY;
const realFetch = global.fetch;
afterEach(() => {
  if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = realKey;
  global.fetch = realFetch;
  clearAiCache();
});

test('heuristicApplyPlan detects cover letter and portfolio requirements', () => {
  const plan = heuristicApplyPlan({
    title: 'Product Designer',
    description: 'Please submit a cover letter and a link to your portfolio (Dribbble/Behance).',
  });
  assert.ok(plan.requirements.includes('Cover letter'));
  assert.ok(plan.requirements.includes('Portfolio / work samples'));
  const labels = plan.suggested_tasks.map((t) => t.label.toLowerCase());
  assert.ok(labels.some((l) => l.includes('cover letter')));
  assert.ok(labels.some((l) => l.includes('portfolio')));
  // Always ends with a follow-up task.
  assert.ok(plan.suggested_tasks.some((t) => t.category === 'follow_up'));
});

test('heuristicApplyPlan adds networking tasks + warnings for high-stakes finance roles', () => {
  const plan = heuristicApplyPlan({
    title: 'Private Equity Associate',
    description: 'Work on buyout and M&A deals. Active security clearance required. Visa sponsorship not available.',
  });
  assert.ok(plan.suggested_tasks.some((t) => t.category === 'networking'));
  assert.ok(plan.warnings.some((w) => /clearance/i.test(w)));
  assert.ok(plan.likely_questions.some((q) => /sponsorship/i.test(q)));
});

test('heuristicApplyPlan never duplicates the follow-up task', () => {
  const plan = heuristicApplyPlan({ title: 'Analyst', description: 'analytics python sql' });
  const followUps = plan.suggested_tasks.filter((t) => t.category === 'follow_up');
  assert.equal(followUps.length, 1);
});

test('applyPlan falls back to the template plan without an API key', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const plan = await applyPlan({ application: { title: 'Engineer', description: 'cover letter required' } });
  assert.equal(plan.source, 'template');
  assert.ok(plan.requirements.includes('Cover letter'));
});

test('applyPlan parses a structured AI response via tool use', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      content: [{
        type: 'tool_use',
        input: {
          requirements: ['Cover letter', ''],
          suggested_tasks: [
            { label: 'Tailor the resume', category: 'document' },
            { label: '', category: 'apply' },          // dropped (no label)
            { label: 'Weird task', category: 'bogus' }, // category normalized to 'apply'
          ],
          likely_questions: ['Why this firm?'],
          warnings: [],
        },
      }],
    }),
  });
  const plan = await applyPlan({ application: { title: 'Analyst', company: 'Acme', description: 'desc' } });
  assert.equal(plan.source, 'ai');
  assert.deepEqual(plan.requirements, ['Cover letter']);          // empties stripped
  assert.equal(plan.suggested_tasks.length, 2);                   // empty-label dropped
  assert.equal(plan.suggested_tasks[1].category, 'apply');        // invalid category normalized
});

test('applyPlan falls back to the template plan when the AI call fails', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  const plan = await applyPlan({ application: { title: 'Engineer', description: 'portfolio required' } });
  assert.equal(plan.source, 'template');
  assert.ok(plan.warning, 'surfaces the failure as a warning');
  assert.ok(plan.requirements.includes('Portfolio / work samples'));
});
