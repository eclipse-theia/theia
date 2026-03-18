---
applyTo: "**"
excludeAgent: "coding-agent"
---

# Theia Code Review Instructions

<!-- Read only by the built-in Copilot reviewer (excludes coding agent).
     Adds review-specific rules on top of copilot-instructions.md (always read together).
     Doc references live in copilot-instructions.md — no need to repeat them here.
     Limit: only first 4,000 chars apply. Cannot invoke @theia-reviewer from here. -->

## Priority Labels

<!-- Inspiration: github/awesome-copilot/code-review-generic.instructions.md -->

- 🔴 **CRITICAL** (block merge): security, correctness bugs, data loss, unrecorded breaking changes
- 🟡 **IMPORTANT** (discuss): missing tests, architecture deviations, significant duplication
- 🟢 **SUGGESTION** (non-blocking): readability, minor convention deviations

## Review Checklist

Work through all 10 items in `doc/pull-requests.md#review-checklist`. Actively verify:

- **Tests** — Tests for new behavior? Check CI via GitHub API; report ignored failures.
- **Breaking changes** — In `CHANGELOG.md`? PR template checkbox checked?
- **Dependencies** — New `package.json` entries justified? License check CI passing?
- **Copyright** — New files have SPDX identifier + copyright line with current year.
- **DCO** — Every commit has `Signed-off-by: Name <email>`.
- **i18n** — User-facing strings use `nls.localizeByDefault` or `nls.localize('theia/<pkg>/<id>', ...)`.

## Codebase Integration

Search for existing equivalents before flagging anything missing. If something already exists, the new code is wrong. Read surrounding code — do not review the diff in isolation.

Permalinks required for any claim about existing code:
`https://github.com/eclipse-theia/theia/blob/<base-sha>/<path>#L<n>`
Get line numbers from `git show origin/master:<path>`, not the PR branch.

## Key Coding Rules

Most commonly violated sections of `doc/coding-guidelines.md`:

- `undefined` not `null`; single quotes; explicit return types; semicolons always
- Property injection (not constructor); `@postConstruct` for init; `inSingletonScope()`
- `bindRootContributionProvider` not `bindContributionProvider` (latter causes memory leaks)
- No `.bind(this)` or inline arrow functions in JSX — use class property arrow functions
- No inline styles; no hard-coded colors — use `ColorContribution` and CSS variables
- Pass URIs between frontend/backend, never raw paths; never string-concatenate URIs
- Platform folders: `common/` everywhere, `browser/` frontend, `node/` backend only

## Accessibility

<!-- Inspiration: github/awesome-copilot/a11y.instructions.md (WCAG 2.2 AA) -->

For UI changes: keyboard operable with visible focus; no color alone to convey information; icons use `currentColor` for forced-colors mode; form controls have visible labels.

## Scope and Quality

- Flag unrelated drive-by changes that belong in a separate PR.
- Flag LLM patterns: meaningless comments, em dashes (—), "it is worth noting", "note that".
- Flag comment anti-patterns: commented-out code, changelog comments, decorative dividers.

<!-- Inspiration: github/awesome-copilot/self-explanatory-code-commenting.instructions.md -->

## Comment Style

<!-- Inspiration: github/awesome-copilot/code-review-generic.instructions.md -->

- 🔴/🟡/🟢 label on every comment; 1–3 sentences; one point per comment
- Group related issues — don't post multiple comments on the same topic
- Acknowledge well-written code — a review that only flags problems reads as hostile
- No em dashes, no "it is worth noting", no "consider leveraging"; claims need a permalink
- Do not repeat existing comments when re-reviewing after new pushes
