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
import { PromptService } from '@theia/ai-core/lib/common';
import { nls } from '@theia/core';
import { AGENT_DELEGATION_FUNCTION_ID } from '@theia/ai-core';
import { GitHubChatAgentId } from './github-chat-agent';

@injectable()
export class AnalyzesGhTicketCommandContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.registerGitHubTicketCommand();
    }

    protected registerGitHubTicketCommand(): void {
        const commandTemplate = this.buildCommandTemplate();

        this.promptService.addBuiltInPromptFragment({
            id: 'analyze-gh-ticket',
            template: commandTemplate,
            isCommand: true,
            commandName: 'analyze-gh-ticket',
            commandDescription: nls.localize(
                'theia/ai-ide/ticketCommand/description',
                'Analyze a GitHub ticket and create an implementation plan'
            ),
            commandArgumentHint: nls.localize(
                'theia/ai-ide/ticketCommand/argumentHint',
                '<ticket-number>'
            ),
            commandAgents: ['Architect']
        });
    }

    protected buildCommandTemplate(): string {
        return `You have been asked to analyze a GitHub ticket and create an implementation plan.

## Ticket Number
$ARGUMENTS

## Task Overview
You need to retrieve details about the specified GitHub ticket and analyze whether it can be implemented by an AI coding agent.

## Step 1: Retrieve Ticket Information
Use the ~{${AGENT_DELEGATION_FUNCTION_ID}} tool to delegate to the GitHub agent and retrieve comprehensive information about the ticket.

**Agent ID:** '${GitHubChatAgentId}'
**Prompt:** Ask the GitHub agent to retrieve ALL details about issue/ticket #$ARGUMENTS, specifically requesting:
- The complete issue title and description/body
- All comments on the issue (this is critical for understanding the full context)
- Labels and assignees
- Issue state (open/closed)
- Any referenced issues or pull requests mentioned in the description or comments
- If other issues are referenced, retrieve their details as well

Example delegation prompt:
\`\`\`
Please retrieve comprehensive information about issue #$ARGUMENTS. I need:
1. The complete issue title, body/description, labels, state, and assignees
2. ALL comments on this issue - every single comment is important for understanding the context
3. Any issues or PRs that are referenced or linked in the description or comments
4. For any referenced issues, please also retrieve their titles and descriptions

This is for analyzing whether the issue can be implemented, so completeness is crucial.
\`\`\`

## Step 2: Analyze AI Solvability
After receiving the ticket information, analyze whether this ticket can be solved by an AI coding agent. Consider:

### Criteria for AI-Solvable Tickets:
- **Clear requirements**: The ticket clearly describes what needs to be done
- **Defined scope**: The scope of changes is well-defined and bounded
- **Technical feasibility**: The task involves code changes that can be reasoned about
- **Sufficient context**: Enough information is provided to understand the problem and solution
- **Reproducible**: For bugs, there's enough information to understand and reproduce the issue

### Criteria for Non-AI-Solvable Tickets:
- **Ambiguous requirements**: The ticket is vague or open to multiple interpretations
- **Missing context**: Critical information is missing (e.g., environment details, reproduction steps)
- **External dependencies**: Requires access to external systems, credentials, or human interaction
- **Design decisions needed**: Requires architectural decisions that need human judgment
- **Insufficient information**: Cannot determine what success looks like

## Step 3: Respond Based on Analysis

### If the ticket CANNOT be solved by AI:
Provide a clear explanation:
1. **Reason**: Explain specifically why this ticket cannot be solved by AI
2. **Missing Information**: List what information is missing or unclear
3. **Questions for Clarification**: Ask specific questions that, if answered, might make the ticket solvable

Example response format:
\`\`\`
## Analysis Result: Cannot Be Solved by AI

### Reason
[Explain why]

### Missing Information
- [Item 1]
- [Item 2]

### Questions for Clarification
1. [Question 1]
2. [Question 2]
\`\`\`

### If the ticket CAN be solved by AI:
Create a detailed implementation plan:

1. **Summary**: Brief summary of what the ticket requests
2. **Analysis**: Your understanding of the problem and the proposed solution approach
3. **Implementation Plan**: A step-by-step plan that a coding agent can follow, including:
   - Files that likely need to be modified or created
   - Specific changes to be made in each file
   - Order of operations
   - Testing considerations
4. **Potential Challenges**: Any challenges or edge cases to be aware of
5. **Success Criteria**: How to verify the implementation is correct

Example response format:
\`\`\`
## Analysis Result: Can Be Solved by AI

### Summary
[Brief summary of the ticket]

### Analysis
[Your understanding of the problem and solution approach]

### Implementation Plan

#### Step 1: [First step]
- File: \`path/to/file\`
- Changes: [Description of changes]

#### Step 2: [Second step]
- File: \`path/to/file\`
- Changes: [Description of changes]

[Continue with additional steps...]

### Potential Challenges
- [Challenge 1]
- [Challenge 2]

### Success Criteria
- [Criterion 1]
- [Criterion 2]

### Next Steps
To implement this plan, you can ask @Coder to execute it.
\`\`\`

Remember: Be thorough in your analysis. It's better to ask for clarification than to create an incomplete or incorrect implementation plan.`;
    }
}
