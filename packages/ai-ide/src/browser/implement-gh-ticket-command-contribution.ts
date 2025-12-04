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
import { AGENT_DELEGATION_FUNCTION_ID } from '@theia/ai-chat/lib/browser/agent-delegation-tool';
import { GitHubChatAgentId } from './github-chat-agent';

@injectable()
export class FixGitHubTicketCommandContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.registerFixGitHubTicketCommand();
    }

    protected registerFixGitHubTicketCommand(): void {
        const commandTemplate = this.buildCommandTemplate();

        this.promptService.addBuiltInPromptFragment({
            id: 'fix-gh-ticket',
            template: commandTemplate,
            isCommand: true,
            commandName: 'fix-gh-ticket',
            commandDescription: nls.localize(
                'theia/ai-ide/fixGhTicketCommand/description',
                'Analyze a GitHub ticket and implement the solution'
            ),
            commandArgumentHint: nls.localize(
                'theia/ai-ide/fixGhTicketCommand/argumentHint',
                '<ticket-number>'
            ),
            commandAgents: ['Coder']
        });
    }

    protected buildCommandTemplate(): string {
        return `You have been asked to analyze a GitHub ticket and implement the solution.

## Ticket Number
$ARGUMENTS

## Task Overview
You need to retrieve details about the specified GitHub ticket, analyze whether it can be implemented, and if so, implement the solution.

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

This is for implementing the issue, so completeness is crucial.
\`\`\`

## Step 2: Analyze AI Solvability
After receiving the ticket information, analyze whether this ticket can be implemented by you. Consider:

### Criteria for Implementable Tickets:
- **Clear requirements**: The ticket clearly describes what needs to be done
- **Defined scope**: The scope of changes is well-defined and bounded
- **Technical feasibility**: The task involves code changes that can be reasoned about
- **Sufficient context**: Enough information is provided to understand the problem and solution
- **Reproducible**: For bugs, there's enough information to understand and reproduce the issue

### Criteria for Non-Implementable Tickets:
- **Ambiguous requirements**: The ticket is vague or open to multiple interpretations
- **Missing context**: Critical information is missing (e.g., environment details, reproduction steps)
- **External dependencies**: Requires access to external systems, credentials, or human interaction
- **Design decisions needed**: Requires architectural decisions that need human judgment
- **Insufficient information**: Cannot determine what success looks like

## Step 3: Respond Based on Analysis

### If the ticket CANNOT be implemented:
Provide a clear explanation:
1. **Reason**: Explain specifically why this ticket cannot be implemented by AI
2. **Missing Information**: List what information is missing or unclear
3. **Questions for Clarification**: Ask specific questions that, if answered, might make the ticket implementable

Example response format:
\`\`\`
## Analysis Result: Cannot Be Implemented

### Reason
[Explain why]

### Missing Information
- [Item 1]
- [Item 2]

### Questions for Clarification
1. [Question 1]
2. [Question 2]

Please provide the missing information and I will proceed with the implementation.
\`\`\`

### If the ticket CAN be implemented:
Proceed with the implementation:

1. **Briefly summarize** what the ticket requests and your implementation approach
2. **Explore the codebase** to understand the existing code structure and find relevant files
3. **Implement the solution** by making the necessary code changes using your file modification tools
4. **Explain your changes** as you make them
5. **Consider edge cases** and handle them appropriately
6. **Suggest testing steps** the user should perform to verify the implementation

Example response format:
\`\`\`
## Analysis Result: Can Be Implemented

### Summary
[Brief summary of the ticket and your approach]

### Implementation
[Proceed to explore the codebase and implement the changes, explaining as you go]
\`\`\`

## Important Guidelines for Implementation
- Always explore the codebase first to understand the existing patterns and conventions
- Follow the existing code style and patterns in the project
- Make incremental changes and explain each step
- If you encounter unexpected issues during implementation, explain them and ask for guidance
- After implementation, summarize what was changed and suggest how to test the changes

Remember: If at any point during implementation you realize you need more information or the task is more complex than initially assessed, stop and ask for clarification rather 
than making assumptions.`;
    }
}
