// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PromptService } from '@theia/ai-core';
import { nls } from '@theia/core';
import { AppTesterChatAgentId } from './app-tester-chat-agent';

@injectable()
export class AppTesterCapabilityContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.promptService.addBuiltInPromptFragment({
            id: 'apptester',
            template: this.buildTemplate()
        });
    }

    protected buildTemplate(): string {
        const name = nls.localize('theia/ai-ide/appTester/name', 'E2E Test');
        const description = nls.localize('theia/ai-ide/appTester/description',
            'Delegates to AppTester agent for browser-based UI verification after implementation.');

        return `---
name: ${name}
description: ${description}
---

## E2E Test

**E2E Testing is ENABLED.** After implementation completes, verify application behavior through AppTester browser automation.

Use end-to-end application testing through browser automation to verify UI behavior
and user flows after implementation.

**When to trigger:** After Implementation Phase completes (Coder reports done + code review passes if enabled).

### Prerequisites

**The Coding Agent must handle ALL prerequisites proactively during implementation:**

1. **Install dependencies** (npm install / yarn install)
2. **Build the project** (compile TypeScript, bundle frontend)
3. **Run tests** (unit tests, integration tests)
4. **Provide build/lint/test evidence** (task names + PASS/FAIL status)

**Why this matters:** AppTester relies on launch configurations which require a working build.
Missing dependencies or builds cause ERR_CONNECTION_REFUSED errors.

**If AppTester reports connection issues:** Go back to Coding Agent to fix build issues,
then retry E2E testing.

### Constraints

- AppTester cannot use 'runTask' (blocks delegation) — use launch configurations only
- Never request "Frontend" or "Electron" launch configs (open windows, cause failures)
- Prefer configs with "Backend", "Server", or "Browser" in name

### Incremental Testing Strategy

**Split complex testing into multiple sequential delegations**

**Benefits:**
- Each delegation focuses on one feature area or user flow
- Later delegations can reuse browser state from earlier ones
- No need to repeat setup steps (login, navigation, data creation)
- Easier to isolate which feature caused a failure
- More manageable test scenarios for the agent

### Delegation

Use ~{delegateToAgent} to delegate to the following agent:

**Agent:** '${AppTesterChatAgentId}'
**When:** After Coding Agent completes implementation AND build/lint/test pass

**Provide:**
- Test scenario with specific steps
- Expected behavior
- Task context path (if exists) — for reference to completion criteria

**For sequential delegations:**
- **First delegation:** Include full setup (start app, navigate to page, login if needed)
- **Subsequent delegations:** Specify to reuse existing browser session
  - Agent will search for the existing page/tab in Chrome
  - Can continue from the current application state
  - No need to repeat setup steps

**Optional:**
- Application URL (default: agent discovers from launch configs)
- Launch configuration name (default: agent selects appropriate one)
- Whether app is already running (default: assumes not running for first delegation,
  running for subsequent delegations)
- Whether to reuse existing browser session (default: false for first delegation,
  true for subsequent delegations)

**Request these behaviors:**
- Report failures on first occurrence — do NOT retry or workaround
- Capture exact error text and status codes, not summaries
- Execute only provided test steps — do not infer requirements
- Report issues objectively — do not suggest code fixes
- For subsequent delegations: Connect to existing browser session and find the active page

**Expected output:** Test result (PASS/FAIL/INCONCLUSIVE) with details and any issues found

### Planning Test Delegations

**When you have multiple test scenarios:**

1. **Analyze dependencies:** Which tests depend on setup from other tests?
2. **Group related tests:** Tests that share setup can run in sequence
3. **Order by dependency:** Tests that create state first, tests that use that state second
4. **Delegate sequentially:** Execute one delegation, wait for result, then next delegation

### Result Handling

| Result | Criteria |
|--------|----------|
| **PASS** | All steps executed successfully, behavior matches expected |
| **FAIL** | One or more steps failed, or behavior does not match expected |
| **INCONCLUSIVE** | Unable to complete testing due to environment/tooling issues |

**PASS:**
- If more test scenarios exist: Continue with next delegation
- If all tests complete: Update Task Context and proceed to Completion
- If Task Context exists: use ~{rewriteTaskContext} to update UI Verification Status

**FAIL:**
- Stop further test delegations (don't test dependent scenarios)
- If Task Context exists: use ~{rewriteTaskContext} to update UI Verification Status to "FAIL",
  record issues
- Re-delegate fix to the Coding Agent
- After fix: restart test sequence from the beginning

**INCONCLUSIVE:**
- Stop further test delegations
- Document environment/tooling issue
- Ask user how to proceed (retry, skip testing, or investigate)

If Task Context exists, use ~{getTaskContext} to read current state and ~{rewriteTaskContext}
to update status.

### Output

- **PASS (single test):** Test verified, continue with next test or proceed to completion
- **PASS (all tests):** All application behavior verified, proceed to completion
- **FAIL:** Issues identified, delegate fixes to the Coding Agent
- **INCONCLUSIVE:** Environment issues, ask user for decision`;
    }
}
