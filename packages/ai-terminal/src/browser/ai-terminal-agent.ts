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
    getJsonOfResponse,
    isLanguageModelParsedResponse,
    LanguageModelRegistry,
    LanguageModelRequirement,
    PromptService,
    UserRequest
} from '@theia/ai-core/lib/common';
import { LanguageModelService } from '@theia/ai-core/lib/browser';
import { generateUuid, ILogger, nls } from '@theia/core';
import { terminalPrompts } from './ai-terminal-prompt-template';
import { inject, injectable } from '@theia/core/shared/inversify';
import { z } from 'zod';

const Commands = z.object({
    commands: z.array(z.string()),
});
type Commands = z.infer<typeof Commands>;

@injectable()
export class AiTerminalAgent implements Agent {

    id = 'Terminal Assistant';
    name = 'Terminal Assistant';
    description = nls.localize('theia/ai/terminal/agent/description', 'This agent provides assistance to write and execute arbitrary terminal commands. \
        Based on the user\'s request, it suggests commands and allows the user to directly paste and execute them in the terminal. \
        It accesses the current directory, environment and the recent terminal output of the terminal session to provide context-aware assistance');
    variables = [];
    functions = [];
    agentSpecificVariables = [
        {
            name: 'userRequest',
            usedInPrompt: true,
            description: nls.localize('theia/ai/terminal/agent/vars/userRequest/description', 'The user\'s question or request.')
        },
        {
            name: 'shell',
            usedInPrompt: true,
            description: nls.localize('theia/ai/terminal/agent/vars/shell/description', 'The shell being used, e.g., /usr/bin/zsh.')
        },
        {
            name: 'cwd',
            usedInPrompt: true,
            description: nls.localize('theia/ai/terminal/agent/vars/cwd/description', 'The current working directory.')
        },
        {
            name: 'recentTerminalContents',
            usedInPrompt: true,
            description: nls.localize('theia/ai/terminal/agent/vars/recentTerminalContents/description', 'The last 0 to 50 recent lines visible in the terminal.')
        }
    ];
    prompts = terminalPrompts;
    languageModelRequirements: LanguageModelRequirement[] = [
        {
            purpose: 'suggest-terminal-commands',
            identifier: 'default/universal',
        }
    ];

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(PromptService)
    protected promptService: PromptService;

    @inject(ILogger)
    protected logger: ILogger;

    @inject(LanguageModelService)
    protected languageModelService: LanguageModelService;

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

        const systemMessage = await this.promptService.getResolvedPromptFragment('terminal-system', parameters).then(p => p?.text);
        const request = await this.promptService.getResolvedPromptFragment('terminal-user', parameters).then(p => p?.text);
        if (!systemMessage || !request) {
            this.logger.error('The prompt service didn\'t return prompts for the AI Terminal Agent.');
            return [];
        }

        const variantInfo = this.promptService.getPromptVariantInfo('terminal-system');

        // since we do not actually hold complete conversions, the request/response pair is considered a session
        const sessionId = generateUuid();
        const requestId = generateUuid();
        const llmRequest: UserRequest = {
            messages: [
                {
                    actor: 'ai',
                    type: 'text',
                    text: systemMessage
                },
                {
                    actor: 'user',
                    type: 'text',
                    text: request
                }
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'terminal-commands',
                    description: 'Suggested terminal commands based on the user request',
                    schema: Commands.toJSONSchema()
                }
            },
            agentId: this.id,
            requestId,
            sessionId,
            promptVariantId: variantInfo?.variantId,
            isPromptVariantCustomized: variantInfo?.isCustomized
        };

        try {
            const result = await this.languageModelService.sendRequest(lm, llmRequest);

            if (isLanguageModelParsedResponse(result)) {
                // model returned structured output
                const parsedResult = Commands.safeParse(result.parsed);
                if (parsedResult.success) {
                    return parsedResult.data.commands;
                }
            }

            // fall back to agent-based parsing of result
            const jsonResult = await getJsonOfResponse(result);
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
