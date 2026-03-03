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

/**
 * Contribution that registers the `/remember` slash command for AI chat agents.
 *
 * This command allows Architect and Coder agents to extract important topics
 * from the current conversation and delegate to the ProjectInfo agent to update
 * the persistent project context file.
 */
@injectable()
export class RememberCommandContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.registerRememberCommand();
    }

    protected registerRememberCommand(): void {
        const commandTemplate = this.buildCommandTemplate();

        this.promptService.addBuiltInPromptFragment({
            id: 'remember-conversation-context',
            template: commandTemplate,
            isCommand: true,
            commandName: 'remember',
            commandDescription: nls.localize(
                'theia/ai-ide/rememberCommand/description',
                'Extract topics from conversation and update project info'
            ),
            commandArgumentHint: nls.localize(
                'theia/ai-ide/rememberCommand/argumentHint',
                '[topic-hint]'
            ),
            commandAgents: ['Architect', 'Coder']
        });
    }

    protected buildCommandTemplate(): string {
        return `You have been asked to extract and remember important information from the current conversation.

    ## Task Overview
    Review the conversation history and identify specific information that should be added to the persistent project context.

    ## Focus Area
    $ARGUMENTS

    ## What to Extract
    **If a focus area is provided above**: ONLY extract information related to that specific focus area. Ignore all other topics.

    **If no focus area is provided**: Look specifically for information where the user had to correct you or provide clarification:
    - **User corrections**: When the user corrected your assumptions about the codebase, architecture, or processes
    - **User-provided context**: Information the user explicitly provided that you couldn't discover yourself
    - **Project-specific knowledge**: Details about the project that the user shared when you made incorrect assumptions

    **Do NOT extract**:
    - General information you discovered through code analysis
    - Standard coding practices you identified yourself
    - Information you found by exploring the codebase
    - Common knowledge or widely-known patterns
    - Details that are already well-documented in the code

    ## Instructions
    1. **Analyze the conversation**: Review messages for the specific criteria above
    2. **Extract only relevant information**: For each qualifying item, prepare a clear description that captures:
    - What the user corrected or clarified
    - Why your initial understanding was incomplete
    - The specific project context that was provided
    3. **Delegate to ProjectInfo agent**: Use the ~{${AGENT_DELEGATION_FUNCTION_ID}} tool to send the extracted information to the ProjectInfo agent:
    - Agent ID: 'ProjectInfo'
    - Prompt: Ask the ProjectInfo agent to review the extracted information and update the project information file

    ## Example Delegation
    \`\`\`
    Please review and incorporate the following user corrections/clarifications into the project context:

    [Your extracted corrections and user-provided context here]

    Update /.prompts/project-info.prompttemplate by adding this information to the appropriate sections. Focus on information that prevents future misunderstandings.
    \`\`\`

    Remember: Only extract information that prevents future AI agents from making the same mistakes or assumptions you made that were corrected by the user.`;
    }
}
