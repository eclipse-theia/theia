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

@injectable()
export class DebugCapabilityContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.promptService.addBuiltInPromptFragment({
            id: 'debug',
            template: this.buildTemplate()
        });
    }

    protected buildTemplate(): string {
        const name = nls.localizeByDefault('Debug');
        const description = nls.localize('theia/ai-ide/debug/description',
            'Logs workflow inconsistencies, unclear instructions, and unexpected behaviors to DEBUG.md for later analysis.');

        return `---
name: ${name}
description: ${description}
---

## Debug Mode

**Debug Mode is ENABLED.** Document any inconsistencies, ambiguities, or unexpected behaviors encountered during this run.

### When to Log

Record an entry when you encounter:
- **Ambiguous instructions** \u2014 unclear requirements, conflicting guidance, missing information
- **Unexpected agent behavior** \u2014 agents not following expected patterns, missing outputs, wrong formats
- **Workflow friction** \u2014 steps that don't flow naturally, missing handoffs, unclear state transitions
- **Tool failures** \u2014 repeated tool errors, unexpected responses, missing capabilities
- **Edge cases** \u2014 situations not covered by the workflow, unclear how to proceed

### How to Log

Use ~{writeFileContent} to append to \`DEBUG.md\` in the current working directory.

Format each entry as:

\`\`\`markdown
## [Timestamp or Session ID]

**Category:** [Ambiguity | Agent Behavior | Workflow | Tool | Edge Case]
**State:** [Current workflow state when issue occurred]
**Context:** [Brief description of what you were trying to do]

**Issue:**
[Describe what was unclear, unexpected, or problematic]

**What Happened:**
[What actually occurred]

**Expected:**
[What you expected to happen, if applicable]

**Workaround:**
[How you proceeded despite the issue, if applicable]

---
\`\`\`

### Rules

- **MANDATORY:** Log issues immediately as they occur \u2014 do not wait until the end
- **MANDATORY:** If an agent doesn't return expected output format, log it before working around it
- Be specific and factual \u2014 avoid vague descriptions
- Include enough context to reproduce or understand the issue later
- Do NOT let logging interrupt the main workflow \u2014 log quickly and continue
- Create \`DEBUG.md\` if it doesn't exist; append if it does`;
    }
}
