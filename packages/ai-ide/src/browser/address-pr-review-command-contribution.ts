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
export class AddressGhReviewCommandContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.registerAddressGhReviewCommand();
    }

    protected registerAddressGhReviewCommand(): void {
        const commandTemplate = this.buildCommandTemplate();

        this.promptService.addBuiltInPromptFragment({
            id: 'address-gh-review',
            template: commandTemplate,
            isCommand: true,
            commandName: 'address-gh-review',
            commandDescription: nls.localize(
                'theia/ai-ide/addressGhReviewCommand/description',
                'Address review comments on a GitHub pull request'
            ),
            commandArgumentHint: nls.localize(
                'theia/ai-ide/addressGhReviewCommand/argumentHint',
                '<pr-number>'
            ),
            commandAgents: ['Coder']
        });
    }

    protected buildCommandTemplate(): string {
        return `You have been asked to address review comments on a GitHub pull request.

## Pull Request Number
$ARGUMENTS

## Task Overview
You need to retrieve all details about the specified pull request, especially the review comments, assess whether you can safely address all comments, and if so, 
implement the requested changes.

## Step 1: Retrieve Pull Request Information
Use the ~{${AGENT_DELEGATION_FUNCTION_ID}} tool to delegate to the GitHub agent and retrieve comprehensive information about the pull request.

**Agent ID:** '${GitHubChatAgentId}'
**Prompt:** Ask the GitHub agent to retrieve ALL details about PR #$ARGUMENTS, specifically requesting:
- The PR title and description
- The current state of the PR (open, closed, merged)
- ALL review comments - this is critical, every single review comment must be retrieved
- General PR comments (conversation)
- The list of files changed in the PR
- Any referenced issues
- Review status (approved, changes requested, etc.)

Example delegation prompt:
\`\`\`
Please retrieve comprehensive information about pull request #$ARGUMENTS. I need:
1. The PR title, description, and current state
2. ALL review comments on this PR - every single inline review comment is critical
3. ALL general conversation comments on the PR
4. The list of files changed in this PR
5. The current review status (approved, changes requested, pending)
6. Any linked or referenced issues

This is for addressing the review comments, so completeness is absolutely crucial. Make sure to get every review comment.
\`\`\`

## Step 2: Analyze and Categorize Review Comments
After receiving the PR information, analyze each review comment and categorize them:

### Categories of Review Comments:
1. **Clear code changes**: Comments requesting specific, unambiguous code modifications (e.g., "rename this variable", "add null check here", "fix this typo")
2. **Style/formatting fixes**: Comments about code style, formatting, or conventions
3. **Bug fixes**: Comments pointing out bugs or issues that need to be fixed
4. **Clarification questions**: Reviewers asking questions that need answers, not code changes
5. **Design discussions**: Comments about architectural or design decisions that require human judgment
6. **Ambiguous requests**: Comments that are unclear or could be interpreted multiple ways

### Criteria for Safely Addressable Comments:
- The requested change is clearly specified
- The change is localized and well-scoped
- No architectural or design decisions are required
- The change doesn't conflict with other review comments
- You have enough context to make the change correctly

### Criteria for Comments Requiring Clarification:
- The comment is ambiguous or vague
- Multiple valid interpretations exist
- The comment requires design decisions
- Comments conflict with each other
- The reviewer is asking a question rather than requesting a change

## Step 3: Respond Based on Analysis

### If ANY comments cannot be safely addressed:
List all comments and their status, then ask for clarification on the problematic ones:

Example response format:
\`\`\`
## PR Review Analysis

### Comments I Can Address:
1. [File: path/to/file.ts, Line X] - "[Comment summary]" - Will [action]
2. [File: path/to/file.ts, Line Y] - "[Comment summary]" - Will [action]

### Comments Requiring Clarification:
1. [File: path/to/file.ts, Line Z] - "[Comment summary]"
   - **Issue**: [Why this needs clarification]
   - **Question**: [Specific question to resolve ambiguity]

2. [File: path/to/other.ts, Line W] - "[Comment summary]"
   - **Issue**: [Why this needs clarification]
   - **Question**: [Specific question to resolve ambiguity]

### Conflicting Comments:
- [Describe any conflicts between review comments]

Please provide clarification on the above items. Once clarified, I can proceed to address all review comments.

Alternatively, if you'd like me to proceed with just the comments I can safely address, please confirm.
\`\`\`

### If ALL comments can be safely addressed:
Proceed with implementing all the requested changes:

1. **List all comments** and what you will do to address each one
2. **Implement the changes** file by file, addressing each review comment
3. **Explain each change** as you make it, referencing the original review comment
4. **Summarize** all changes made at the end

Example response format:
\`\`\`
## PR Review Analysis

All review comments can be safely addressed. Proceeding with implementation.

### Review Comments to Address:
1. [File: path/to/file.ts, Line X] - "[Comment summary]" - Will [action]
2. [File: path/to/file.ts, Line Y] - "[Comment summary]" - Will [action]
...

### Implementation
[Proceed to make changes, explaining each one]

### Summary
[List all changes made and which review comments they address]
\`\`\`

## Important Guidelines
- Always preserve the intent of the original code while addressing review comments
- If a review comment conflicts with the existing code style, follow the project's conventions
- Make minimal changes - only change what's necessary to address each comment
- If you discover issues beyond the review comments, mention them but don't fix them unless asked
- After implementation, provide a summary that maps each change to the review comment it addresses

Remember: It's better to ask for clarification than to make assumptions that could introduce bugs or go against the reviewer's intent.`;
    }
}
