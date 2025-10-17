// *****************************************************************************
// Copyright (C) 2025 EclipseSource and others.
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

import { PromptService } from '@theia/ai-core/lib/common/prompt-service';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';

export function bindSampleChatCommandContribution(bind: interfaces.Bind): void {
    bind(SampleChatCommandContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SampleChatCommandContribution);
}

/**
 * This contribution demonstrates how to register slash commands as prompt fragments for chat agents.
 * Commands can use argument substitution ($ARGUMENTS, $1, $2, etc.) and be filtered by agent.
 *
 * The commands registered here will be available in the chat input autocomplete when typing '/'.
 * For example, the '/explain' command is only available when using the 'Universal' agent.
 */
@injectable()
export class SampleChatCommandContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.registerCommands();
    }

    protected registerCommands(): void {
        // Example 1: Simple command available for all agents
        this.promptService.addBuiltInPromptFragment({
            id: 'sample-hello',
            template: 'Say hello to $ARGUMENTS in a friendly way.',
            isCommand: true,
            commandName: 'hello',
            commandDescription: 'Say hello to someone',
            commandArgumentHint: '<name>'
        });

        // Example 2: Command with $ARGUMENTS and specific agent
        this.promptService.addBuiltInPromptFragment({
            id: 'sample-explain',
            template: `Provide a clear and detailed explanation of the following topic: $ARGUMENTS

Consider:
- Core concepts and definitions
- Practical examples
- Common use cases
- Best practices`,
            isCommand: true,
            commandName: 'explain',
            commandDescription: 'Explain a concept in detail',
            commandArgumentHint: '<topic>',
            commandAgents: ['Universal']
        });

        // Example 3: Command with numbered arguments ($1, $2)
        this.promptService.addBuiltInPromptFragment({
            id: 'sample-compare',
            template: `Compare and contrast the following two items:

Item 1: $1
Item 2: $2

Please analyze:
- Key similarities
- Important differences
- When to use each
- Specific advantages and disadvantages`,
            isCommand: true,
            commandName: 'compare',
            commandDescription: 'Compare two concepts or items',
            commandArgumentHint: '<item1> <item2>',
            commandAgents: ['Universal']
        });

        // Example 4: Command combining $ARGUMENTS with variables
        this.promptService.addBuiltInPromptFragment({
            id: 'sample-analyze',
            template: `Analyze the selected code with focus on: $ARGUMENTS

Selected code:
#selection

Consider the overall file context:
#file`,
            isCommand: true,
            commandName: 'analyze',
            commandDescription: 'Analyze code with specific focus',
            commandArgumentHint: '<focus-area>',
            commandAgents: ['Universal']
        });

        // Example 5: Command with optional arguments (shown by [] in hint)
        this.promptService.addBuiltInPromptFragment({
            id: 'sample-summarize',
            template: `Create a concise summary of the following content$1.

Content: $ARGUMENTS`,
            isCommand: true,
            commandName: 'summarize',
            commandDescription: 'Summarize content',
            commandArgumentHint: '<content> [style]'
        });

        // Example 6: Multi-agent command (available for multiple specific agents)
        this.promptService.addBuiltInPromptFragment({
            id: 'sample-debug',
            template: `Help debug the following issue: $ARGUMENTS

Focus on:
- Identifying the root cause
- Providing specific solutions
- Suggesting preventive measures`,
            isCommand: true,
            commandName: 'debug',
            commandDescription: 'Get help debugging an issue',
            commandArgumentHint: '<problem-description>',
            commandAgents: ['Universal', 'AskAndContinue']
        });
    }
}
