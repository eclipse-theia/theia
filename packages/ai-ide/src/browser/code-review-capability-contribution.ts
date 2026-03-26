// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { CodeReviewerAgentId } from './code-reviewer-agent';

@injectable()
export class CodeReviewCapabilityContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.promptService.addBuiltInPromptFragment({
            id: 'code-review-mode',
            template: this.buildTemplate()
        });
    }

    protected buildTemplate(): string {
        const name = nls.localizeByDefault('Review');
        const description = nls.localize('theia/ai-ide/codeReview/description',
            'Delegates to code-reviewer agent after each implementation. Blocks next steps until review passes.');

        return `---
name: ${name}
description: ${description}
---

## Code Review

**Code Review is ENABLED.** Review all Coding Agent completions via code-reviewer
before proceeding.

Enforce quality gates through mandatory code review. Do not proceed until code changes pass review.

**When to trigger:** Immediately after code changes are received.

### Constraints

- Trigger a code review after every Coding Agent completion
- Do not proceed to next steps until review passes
- Track revision attempts; escalate to user after 3 failures

### Delegation

Use ~{delegateToAgent} to delegate to the following agent:

**Agent:** '${CodeReviewerAgentId}'
**When:** Immediately after Coding Agent reports completion

**Provide:**
- Task name
- Modified files list
- Requirements summary
- Task context path (if exists) — reviewer will use ~{getTaskContext} to read completion criteria
- Build/lint/test evidence from Coding Agent (task names + PASS/FAIL status)
- If revision attempt: which attempt number and previously flagged issues

**Expected output:** Verdict (PASS / REVISE / REJECT) with explanation

### Verdict Handling

**PASS:**
- If Task Context exists: use ~{rewriteTaskContext} to move item to Completed Items
- Proceed to next step

**REVISE:**
- Delegate back to Coding Agent with specific feedback from reviewer
- Increment failure count
- If failures ≥ 3: escalate to user

**REJECT:**
- Inform user: "Code review identified fundamental issues requiring replanning"
- Return to Planning phase

### Escalation (after 3 failures)

Present to user:

**Review Failed 3 Times**
- Item: [Description]
- Recurring issues: [List from reviewer feedback]
- Options: Adjust requirements, Revise approach, or Accept with documented trade-offs

Wait for user decision.

### Output

- **PASS:** Code verified, proceed to next step
- **REVISE:** Delegate feedback to Coding Agent for fixes
- **REJECT:** Fundamental issues identified, return to Planning`;
    }
}
