# Resolver fixture lab (Unit 2.6)

Per the Unit 2.4 architectural pivot, the browser extension no longer scrapes or
fills the DOM. Live form extraction — including **shadow DOM, iframes, and
multi-step Workday-class flows** — is handled **server-side by Stagehand** over
the Chrome DevTools Protocol.

These fixtures therefore represent the **normalized output of
`stagehand.extract()`** — arrays of `{ label, type, options?, required,
currentValue }` — for a range of ATS:

| Fixture | Exercises |
|---------|-----------|
| `greenhouse.json` | modern form, split name, EEO selects (skipped) |
| `lever.json` | full-name field, a **pre-filled** field (skipped), location/github |
| `ashby.json` | categorical selects: visa sponsorship + language proficiency |
| `workday.json` | **gnarly**: verbose labels, `{value,label}` options, SSN + EEO + veteran (skipped), descriptive work-auth select, prefilled-free |
| `generic.json` | boutique form; free-text question answered from saved Q&A |

`fixtures.test.js` runs each fixture through `runApply` with a **mocked
Stagehand** that replays the fields, and asserts the resolver fills the right
values, **skips EEO/SSN/redacted and pre-filled fields**, and chooses **valid
option values** for categorical controls (never free text, never invented).
