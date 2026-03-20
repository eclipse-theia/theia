---
applyTo: "**/*.spec.ts,**/*.ui-spec.ts,**/*.slow-spec.ts"
description: "Test structure, JSDOM setup, and common mistakes for Theia test files"
---

# Theia Testing Instructions

<!-- Applies to all test files. Covers test structure, JSDOM setup, and assertion style.
     Test types: *.spec.ts (unit), *.ui-spec.ts (UI/Playwright), *.slow-spec.ts (integration).
     Full reference: doc/Testing.md
     General coding rules: theia-coding.instructions.md -->

## File Requirements

Every test file must start with an SPDX copyright header (copy from any existing spec file in the
same package). No exceptions — the license CI check will fail without it.

## Test Structure

Use `chai` for assertions (`expect` style). Mocha's `describe`/`it` for structure.

```ts
import { expect } from 'chai';

describe('MyService', () => {
    let service: MyService;

    beforeEach(() => {
        service = new MyService();
    });

    afterEach(() => {
        service.dispose();
    });

    it('does the thing', () => {
        expect(service.doThing()).to.equal('expected');
    });
});
```

## Browser Tests (*.spec.ts with DOM)

Tests that need browser APIs must wrap JSDOM setup around the imports that require it.
Call `enableJSDOM()` before importing browser modules, then `disableJSDOM()` after:

```ts
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { MyBrowserService } from './my-browser-service';

disableJSDOM();
```

## Container Setup

For DI-based unit tests, create a minimal `Container` with only the bindings under test.
Do not reuse the application container — test isolation is the goal.

## Integration Tests

Unit tests live in `packages/*/src/**/*.spec.ts`. End-to-end tests live in `examples/api-tests/src/*.spec.js` — not in unit test files. E2E tests:

- Test against application APIs (`EditorManager`, `WorkspaceService`, etc.) — never DOM or CSS directly
- Access services via `window.theia.container.get(ServiceClass)`
- Are published so adopters can run them against their own products

## Common Mistakes

- Missing SPDX header — license CI will flag it.
- Forgetting `disableJSDOM()` after DOM imports — leaks JSDOM into subsequent tests.
- Using `assert` (Node.js) instead of `chai` — inconsistent with the rest of the codebase.
- Leaving `describe.only` or `it.only` in committed code — blocks the full test suite.
- Not cleaning up disposables in `afterEach` — causes state leakage between tests.
