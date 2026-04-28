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
import { ArchitectAgentId } from './architect-agent';
import { ContextReviewerAgentId } from './context-reviewer-agent';

@injectable()
export class JuniorPlanCapabilityContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.promptService.addBuiltInPromptFragment({
            id: 'plan-mode',
            template: this.buildTemplate()
        });
    }

    protected buildTemplate(): string {
        const name = nls.localize('theia/ai-ide/juniorPlan/name', 'Plan');
        const description = nls.localize('theia/ai-ide/juniorPlan/description',
            'Creates Task Context documents to track requirements, implementation steps, and completion criteria across all workflow phases.');

        return `---
name: ${name}
description: ${description}
---

### Team Extension

- **${ArchitectAgentId}** — Takes over planning responsibility from Coder.
Analyzes requirements, explores the codebase, creates and updates implementation plans (task contexts).
- **${ContextReviewerAgentId}** — Reviews every task context change for quality and completeness.

## Plan

**Planning is ENABLED.** Use Task Context documents for coordination across all workflow phases.

### Workflow

#### Task Context Creation

**Agent:** '${ArchitectAgentId}'

**Provide:**
- User requirements
- Any context provided by the product owner

**Expected output — one of two outcomes:**

1. **Finalized plan:** taskContextId + brief summary of the plan + overall risk level (High/Low) + whether the change has UI impact (Yes/No)
2. **Draft with questions:** taskContextId + questions/options for the product owner (the task context has Status: Draft)

**Post-delegation:**
- In **both** cases: Run Task Context Verification. If ${ArchitectAgentId} did not return a taskContextId, push back on the agent.
**Record the taskContextId in the todo list so it's available for all subsequent delegations.**
- **If finalized plan:** Proceed to Document Review.
- **If draft with questions:** Present the questions/options to the product owner and WAIT for their response.
When the product owner responds, re-delegate to ${ArchitectAgentId} with the taskContextId and the product owner's answers.
Do NOT proceed to Document Review for drafts — drafts are intermediate states, not reviewable plans.

#### Document Review

**Agent:** '${ContextReviewerAgentId}'

MANDATORY: Every delegation to ${ArchitectAgentId} that produces or updates a **finalized** Task Context MUST be followed by a delegation to \`${ContextReviewerAgentId}\`
**before** proceeding to any other step.
This applies to initial creation, rescoping, feedback fixes, and mid-task updates alike.

**Exception:** Draft task contexts (Status: Draft) do NOT require Document Review. Drafts are intermediate states
where the Architect is awaiting product owner decisions before finalizing the plan.

**Provide:**
- taskContextId (from ${ArchitectAgentId})

**Expected output:** Feedback with severity (🔴 High / 🟡 Medium / 🟢 Low)

**Post-delegation:** Run Task Context Verification before proceeding.

**Handle feedback:**
- 🔴 High: Must fix before proceeding — **delegate back to '${ArchitectAgentId}'** with the feedback. **Do NOT fix the plan yourself.**
- 🟡 Medium: **Delegate back to '${ArchitectAgentId}'** to fix or document rationale
- 🟢 Low: Optional — proceed without fixing

**Critical:** Plan fixes are always delegated to '${ArchitectAgentId}'.

If 🔴 issues persist after 2 cycles → escalate to user.

#### Approval Gate

**When:** High-risk tasks (any risk factor is High)
**Skip when:** All risk factors are Low

Present task summary with problem, scope, and criteria. Wait for "approve" or feedback.

On feedback: Delegate updates to '${ArchitectAgentId}', return to Document Review.

### Before starting Implementation

After the planning agent delivers the plan:
1. Re-read the product owner's original request
2. Verify the plan addresses it — not a superset, not a subset, not a drift
3. If anything seems misaligned, push back on the planning agent before proceeding
4. If the plan includes decisions that should be the product owner's, surface them

Do NOT delegate to Coder until you're confident the plan matches the product owner's intent.

### Handling Product Owner Feedback

When the product owner gives feedback, corrections, or new direction at any point during the task,
delegate to ${ArchitectAgentId} to update the plan and follow the full process
— Document Review must be completed before proceeding to implementation.

This overrides the core "Handling Product Owner Feedback" rule when a task context exists.`;
    }
}
