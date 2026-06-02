import { useState } from 'react';

// Explainable job-fit badge. Click to expand the reasons (why it matches) and
// gaps (what's missing). `fit` is { score, reasons[], gaps[], source }.
export function fitTier(score) {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'good';
  if (score >= 40) return 'stretch';
  return 'low';
}

export default function FitBadge({ fit }) {
  const [open, setOpen] = useState(false);
  if (!fit || typeof fit.score !== 'number') return null;

  const tier = fitTier(fit.score);
  const reasons = fit.reasons || [];
  const gaps = fit.gaps || [];
  const expandable = reasons.length > 0 || gaps.length > 0;

  return (
    <>
      <button
        type="button"
        className={`fit-badge tier-${tier}`}
        onClick={() => expandable && setOpen((o) => !o)}
        title={fit.source === 'ai' ? 'AI-scored fit' : 'Heuristic fit (no API key)'}
        aria-expanded={open}
      >
        <span className="fit-num">{fit.score}% fit</span>
        {fit.source && <span className="fit-src">{fit.source === 'ai' ? 'AI' : '~'}</span>}
        {expandable && <span className="fit-caret">{open ? '▴' : '▾'}</span>}
      </button>

      {open && (
        <div className="fit-detail">
          {reasons.length > 0 && (
            <>
              <h5>Why it matches</h5>
              <ul>{reasons.map((r, i) => <li key={i} className="good">{r}</li>)}</ul>
            </>
          )}
          {gaps.length > 0 && (
            <>
              <h5>Potential gaps</h5>
              <ul>{gaps.map((g, i) => <li key={i} className="gap">{g}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </>
  );
}
