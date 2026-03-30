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

## Plan

**Planning is ENABLED.** Use Task Context documents for coordination across all workflow phases.

Use structured planning, requirements analysis, and task tracking through Task Context documents managed via task context functions.

### Critical Constraints

- **NEVER explore files yourself** — delegate ALL exploration to '${ArchitectAgentId}'
- **NEVER read code files** before delegating — ${ArchitectAgentId} handles investigation
- **NEVER analyze implementation details** — that's ${ArchitectAgentId}'s responsibility
- Delegate plan creation to '${ArchitectAgentId}' immediately
- Track progress through Open Items → Completed Items
- All architectural decisions require user approval

### Workflow

Follow this multi-step delegation flow:
1. Delegate plan creation to '${ArchitectAgentId}'
2. Delegate review of that plan to '${ContextReviewerAgentId}'
3. Store the task context path for use in subsequent phases

#### Task Context Creation

Use ~{delegateToAgent} to delegate to the following agent:

**Agent:** '${ArchitectAgentId}'
**When:** Creating the implementation plan

**Provide:**
- User requirements
- Findings from exploration (if any)
- Constraints and assumptions

**Expected output:** Task context path + overall risk level (High/Low)

**Post-delegation:** Run Task Context Verification. If ${ArchitectAgentId} did not return a task context path, check ~{listTaskContexts} and log a debug entry.

#### Document Review

Use ~{delegateToAgent} to delegate to the following agent:

**Agent:** '${ContextReviewerAgentId}'
**When:** After architect creates or updates Task Context

**Provide:**
- Task context path (from architect)
- List of 2-3 key implementation files for context
- Brief description of what task modifies

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

### Output

Task Context created with:
- Clear requirements and scope
- Risk assessment with overall rating
- Measurable completion criteria
- Implementation plan with tracked items

Store the task context path for distribution to other agents in subsequent phases.`;
    }
}
