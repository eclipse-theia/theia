// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { Agent, isLanguageModelStreamResponse, isLanguageModelTextResponse, LanguageModelRegistry, LanguageModelResponse, PromptService } from '@theia/ai-core/lib/common';
import { ILogger } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class AiTerminalAgent implements Agent {

    id = 'ai-terminal';
    name = 'AI Terminal Assistant';
    description = `
        This agent provides an AI assistant in the terminal.
        It accesses the terminal environment, past terminal commands of the terminal session,
        and recent terminal output to provide context-aware assistance.`;
    variables = [];
    promptTemplates = [
        {
            id: 'ai-terminal:system-prompt',
            name: 'AI Terminal System Prompt',
            description: 'Prompt for the AI Terminal Assistant',
            template: `
# Instructions
Generate one or more command suggestions based on the user's request, considering the shell being used,
the current working directory, and the recent terminal contents. Provide the best suggestion first,
followed by other relevant suggestions if the user asks for further options. 

Parameters:
- user-request: The user's question or request.
- shell: The shell being used, e.g., /usr/bin/zsh.
- cwd: The current working directory.
- recent-terminal-contents: The last 0 to 50 recent lines visible in the terminal.

Return the result in the following JSON format:
{
  "commands": [
    "best_command_suggestion",
    "next_best_command_suggestion",
    "another_command_suggestion"
  ]
}

## Example
user-request: "How do I commit changes?"
shell: "/usr/bin/zsh"
cwd: "/home/user/project"
recent-terminal-contents:
git status
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean

## Expected JSON output
\`\`\`json
\{
  "commands": [
    "git commit",
    "git commit --amend",
    "git commit -a"
  ]
}
\`\`\`
`
        },
        {
            id: 'ai-terminal:user-prompt',
            name: 'AI Terminal User Prompt',
            description: 'Prompt that contains the user request',
            template: `
user-request: \${userRequest}
shell: \${shell}
cwd: \${cwd}
recent-terminal-contents:
\${recentTerminalContents}
`
        }
    ];
    languageModelRequirements = [
        {
            agent: this.id,
            purpose: 'suggest-terminal-commands',
        }
    ];

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(PromptService)
    protected promptService: PromptService;

    @inject(ILogger)
    protected logger: ILogger;

    async getCommands(input: {
        userRequest: string,
        cwd: string,
        shell: string,
        recentTerminalContents: string[],
    }): Promise<string[]> {

        const lms = await this.languageModelRegistry.selectLanguageModels(this.languageModelRequirements[0]);
        if (lms.length === 0) {
            this.logger.error('No language model available for the AI Terminal Agent.');
            return [];
        }
        const lm = lms[0];

        const systemPrompt = this.promptService.getPrompt('ai-terminal:system-prompt', input);
        const userPrompt = this.promptService.getPrompt('ai-terminal:user-prompt', input);
        if (!systemPrompt || !userPrompt) {
            this.logger.error('The prompt service didn\'t return prompts for the AI Terminal Agent.');
            return [];
        }

        const result = await lm.request({
            messages: [
                {
                    actor: 'ai',
                    type: 'text',
                    query: systemPrompt
                },
                {
                    actor: 'user',
                    type: 'text',
                    query: userPrompt
                }
            ]
        });

        const contentResult = await this.waitAndGet(result);
        return this.parseJsonBlock(contentResult);
    }

    protected async waitAndGet(response: LanguageModelResponse): Promise<string> {
        if (isLanguageModelTextResponse(response)) {
            return response.text;
        }
        if (isLanguageModelStreamResponse(response)) {
            let content = '';
            for await (const token of response.stream) {
                content += token.content;
            }
            return content;
        }
        return '';
    }

    protected parseJsonBlock(input: string): string[] {
        const regex = /```json\s*([\s\S]*?)\s*```/g;
        let match;

        // try finding ```json ... ```
        // eslint-disable-next-line no-null/no-null
        while ((match = regex.exec(input)) !== null) {
            try {
                const jsonData = JSON.parse(match[1]);
                if (jsonData.commands) {
                    return jsonData.commands;
                }
            } catch (error) {
                console.error('Failed to parse JSON:', error);
            }
        }

        // try parsing directly
        const data = JSON.parse(input);
        if (data.commands) {
            return data.commands;
        }

        return [];
    }

}
