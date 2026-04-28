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

### Team Extension

- **${AppTesterChatAgentId}** — Verifies application behavior through browser automation after implementation.

## E2E Test

**E2E Testing is ENABLED.** After implementation completes, verify application behavior through AppTester browser automation.

Use end-to-end application testing through browser automation to verify UI behavior
and user flows after implementation.

**When to trigger:** After Implementation Phase completes (Coder reports done + code review passes if enabled).

**Skip when:** The change has no UI impact — determined by:
- Architect's plan (if plan-mode is enabled) reports no UI impact
- Coder's output (if no plan exists) reports no UI files touched

**If unsure:** Run E2E testing. It is better to test unnecessarily than to skip and miss a regression.

### Incremental Testing Strategy

**Split complex testing into multiple sequential delegations**

**Benefits:**
- Each delegation focuses on one feature area or user flow
- Later delegations can reuse browser state from earlier ones
- No need to repeat setup steps (login, navigation, data creation)
- Easier to isolate which feature caused a failure
- More manageable test scenarios for the agent

### Delegation

**Agent:** '${AppTesterChatAgentId}'

**Provide:**
- Test scenario with specific steps
- Expected behavior
- taskContextId (if exists) — for reference to completion criteria

**For sequential delegations:**
- **First delegation:** Include full setup (start app, navigate to page, login if needed)
- **Subsequent delegations:** Specify to reuse existing browser session

**Optional:**
- Application URL
- Launch configuration name
- Whether app is already running
- Whether to reuse existing browser session

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
- If Task Context exists: use editTaskContext to update UI Verification Status

**FAIL:**
- Stop further test delegations (don't test dependent scenarios)
- If Task Context exists: use editTaskContext to update UI Verification Status to "FAIL",
record issues
- Re-delegate fix to the Coding Agent
- After fix: restart test sequence from the beginning

**INCONCLUSIVE:**
- Stop further test delegations
- Document environment/tooling issue
- **If connection issues (e.g., ERR_CONNECTION_REFUSED):** Go back to Coding Agent to fix build issues, then retry E2E testing.
- Otherwise: Ask user how to proceed (retry, skip testing, or investigate)`;
    }
}
