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

import {
    Agent,
    CommunicationRecordingService,
    getJsonOfResponse,
    isLanguageModelParsedResponse,
    LanguageModelRegistry, LanguageModelRequirement,
    PromptService
} from '@theia/ai-core/lib/common';
import { generateUuid, ILogger } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

const Commands = z.object({
    commands: z.array(z.string()),
});
type Commands = z.infer<typeof Commands>;

@injectable()
export class AiTerminalAgent implements Agent {
    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    id = 'Terminal Assistant';
    name = 'Terminal Assistant';
    description = 'This agent provides assistance to write and execute arbitrary terminal commands. \
        Based on the user\'s request, it suggests commands and allows the user to directly paste and execute them in the terminal. \
        It accesses the current directory, environment and the recent terminal output of the terminal session to provide context-aware assistance';
    variables = [];
    functions = [];
    agentSpecificVariables = [
        { name: 'userRequest', usedInPrompt: true, description: 'The user\'s question or request.' },
        { name: 'shell', usedInPrompt: true, description: 'The shell being used, e.g., /usr/bin/zsh.' },
        { name: 'cwd', usedInPrompt: true, description: 'The current working directory.' },
        { name: 'recentTerminalContents', usedInPrompt: true, description: 'The last 0 to 50 recent lines visible in the terminal.' }
    ];
    promptTemplates = [
        {
            id: 'terminal-system',
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
            id: 'terminal-user',
            name: 'AI Terminal User Prompt',
            description: 'Prompt that contains the user request',
            template: `
user-request: {{userRequest}}
shell: {{shell}}
cwd: {{cwd}}
recent-terminal-contents:
{{recentTerminalContents}}
`
        }
    ];
    languageModelRequirements: LanguageModelRequirement[] = [
        {
            purpose: 'suggest-terminal-commands',
            identifier: 'openai/gpt-4o',
        }
    ];

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(PromptService)
    protected promptService: PromptService;

    @inject(ILogger)
    protected logger: ILogger;

    async getCommands(
        userRequest: string,
        cwd: string,
        shell: string,
        recentTerminalContents: string[],
    ): Promise<string[]> {
        const lm = await this.languageModelRegistry.selectLanguageModel({
            agent: this.id,
            ...this.languageModelRequirements[0]
        });
        if (!lm) {
            this.logger.error('No language model available for the AI Terminal Agent.');
            return [];
        }

        const parameters = {
            userRequest,
            shell,
            cwd,
            recentTerminalContents
        };

        const systemPrompt = await this.promptService.getPrompt('terminal-system', parameters).then(p => p?.text);
        const userPrompt = await this.promptService.getPrompt('terminal-user', parameters).then(p => p?.text);
        if (!systemPrompt || !userPrompt) {
            this.logger.error('The prompt service didn\'t return prompts for the AI Terminal Agent.');
            return [];
        }

        // since we do not actually hold complete conversions, the request/response pair is considered a session
        const sessionId = generateUuid();
        const requestId = generateUuid();
        this.recordingService.recordRequest({
            agentId: this.id,
            sessionId,
            timestamp: Date.now(),
            requestId,
            request: systemPrompt,
            messages: [userPrompt],
        });

        try {
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
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'terminal-commands',
                        description: 'Suggested terminal commands based on the user request',
                        schema: zodToJsonSchema(Commands)
                    }
                }
            });

            if (isLanguageModelParsedResponse(result)) {
                // model returned structured output
                const parsedResult = Commands.safeParse(result.parsed);
                if (parsedResult.success) {
                    const responseTextfromParsed = JSON.stringify(parsedResult.data.commands);
                    this.recordingService.recordResponse({
                        agentId: this.id,
                        sessionId,
                        timestamp: Date.now(),
                        requestId,
                        response: responseTextfromParsed,
                    });
                    return parsedResult.data.commands;
                }
            }

            // fall back to agent-based parsing of result
            const jsonResult = await getJsonOfResponse(result);
            const responseTextFromJSON = JSON.stringify(jsonResult);
            this.recordingService.recordResponse({
                agentId: this.id,
                sessionId,
                timestamp: Date.now(),
                requestId,
                response: responseTextFromJSON
            });
            const parsedJsonResult = Commands.safeParse(jsonResult);
            if (parsedJsonResult.success) {
                return parsedJsonResult.data.commands;
            }

            return [];

        } catch (error) {
            this.logger.error('Error obtaining the command suggestions.', error);
            return [];
        }
    }

}
