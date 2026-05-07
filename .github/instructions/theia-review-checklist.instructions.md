---
applyTo: "**"
excludeAgent: "coding-agent"
description: "PR template and review checklist verification for Theia code reviews"
---

# Theia Review Checklist Instructions

## Review Checklist

Actively verify each item below. Do not just trust the author's checkboxes.

- **Tests** — Are there tests for new behavior? Check CI via GitHub API and report any ignored failures (lint, build, tests).
- **Breaking changes** — A breaking change is any non-backward-compatible modification to a `@stable` API (jsdoc tag). Experimental APIs (no tag or `@experimental`) may change in a minor release without a deprecation cycle. If a stable API is broken: is it recorded in `CHANGELOG.md`? Is the PR template checkbox checked?
- **Dependencies** — Are new `package.json` entries justified? Is the license check CI passing? If CI reports `ERROR: Found results that aren't part of the baseline`, the new dependency needs license review.
- **Copied code** — Is any third-party code included? The 3pp/dash license CI check must be green. If red, a CQ is needed.
- **Copyright** — Every new file must have an SPDX identifier and a copyright line with the current year and the name of the contributing entity (individual or company).
- **Commit quality** — Each commit has a meaningful title and body. History is rebased on master with no noise commits.
- **i18n** — All user-facing strings use `nls.localizeByDefault('...')` for VS Code strings or `nls.localize('theia/<pkg>/<id>', '...')` for Theia strings. Dynamic values are passed as args, never interpolated.

## PR Template

Verify these sections are filled in (not blank, not "see title"):

- **What it does** — substantive description referencing relevant issues
- **How to test** — concrete steps a reviewer can follow to reproduce or verify; not "it works"
- **Follow-ups** — known issues, technical debt, or future work; linked tickets where applicable
- **Breaking changes** checkbox — checked if applicable, with `CHANGELOG.md` updated
- **Attribution** — present if the changelog entry needs a contribution credit
- **Review checklist** checkboxes — both author checkboxes ticked before review was requested
