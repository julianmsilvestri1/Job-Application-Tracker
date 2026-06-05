// Detect employer/ATS application pages so the content script can offer an
// inline review on the surfaces that matter (Greenhouse/Lever/Ashby/Workday…).
// Pure + dependency-free so it is unit-testable.
export const KNOWN_ATS = [
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'icims.com',
  'smartrecruiters.com', 'bamboohr.com', 'workable.com', 'taleo.net',
  'successfactors.com', 'eightfold.ai', 'jobvite.com', 'breezy.hr',
];

function hostnameOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function pathOf(url) {
  try { return new URL(url).pathname.toLowerCase(); } catch { return ''; }
}

const onKnownAts = (host) => KNOWN_ATS.some((d) => host === d || host.endsWith(`.${d}`));

// Human label for the current host (the matched ATS domain, else the hostname).
export function atsLabel(url) {
  const host = hostnameOf(url);
  return KNOWN_ATS.find((d) => host === d || host.endsWith(`.${d}`)) || host;
}

// True on a known ATS host, or on a URL whose path clearly indicates an
// application form (kept conservative to avoid banners on unrelated pages).
export function isApplyPage(url) {
  const host = hostnameOf(url);
  if (!host) return false;
  if (onKnownAts(host)) return true;
  return /(^|\/)(apply|applications?)(\/|$)/.test(pathOf(url));
}
