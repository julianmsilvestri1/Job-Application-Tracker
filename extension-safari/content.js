// Phase-2 scaffold: heuristic autofill of the current page's form fields
// using profile data served by the running portal.
//
// Matches each input on the page to a profile field by looking at its label,
// name, id, placeholder and autocomplete attributes. Reviewed by you, never
// auto-submitted.

const PORTAL = 'http://localhost:4000';

// Maps profile-field labels (from /api/assistant/autofill) to keywords that
// commonly appear on application form inputs.
const HINTS = {
  'First name': ['first name', 'firstname', 'given-name', 'fname'],
  'Last name': ['last name', 'lastname', 'family-name', 'lname', 'surname'],
  'Full name': ['full name', 'your name', 'name'],
  Email: ['email', 'e-mail'],
  Phone: ['phone', 'mobile', 'tel'],
  Location: ['location', 'city', 'address'],
  'LinkedIn URL': ['linkedin'],
  'GitHub URL': ['github'],
  Website: ['website', 'portfolio', 'url'],
  'Years of experience': ['years of experience', 'experience'],
  'Work authorization': ['work authorization', 'authorized to work', 'visa'],
  'Desired salary': ['salary', 'compensation', 'expected pay'],
};

async function fetchFields() {
  const res = await fetch(`${PORTAL}/api/assistant/autofill`);
  const data = await res.json();
  return Object.fromEntries(data.fields.map((f) => [f.label, f.value]));
}

function describe(el) {
  const label = el.labels?.[0]?.textContent || '';
  return `${label} ${el.name} ${el.id} ${el.placeholder} ${el.autocomplete}`.toLowerCase();
}

function setValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value')?.set;
  setter ? setter.call(el, value) : (el.value = value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function autofill() {
  const fields = await fetchFields();
  const inputs = document.querySelectorAll('input, textarea');
  let filled = 0;

  inputs.forEach((el) => {
    if (el.type === 'hidden' || el.type === 'password' || el.value) return;
    const haystack = describe(el);
    for (const [label, value] of Object.entries(fields)) {
      const hints = HINTS[label] || [label.toLowerCase()];
      if (value && hints.some((h) => haystack.includes(h))) {
        setValue(el, value);
        filled += 1;
        break;
      }
    }
  });
  return filled;
}

// Allow the popup to trigger autofill via message passing.
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'AUTOFILL') {
      autofill().then((filled) => sendResponse({ filled }));
      return true; // keep the channel open for the async response
    }
  });
}
