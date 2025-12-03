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
import { terminalPrompts } from './ai-terminal-assistant-prompt-template';
import { inject, injectable } from '@theia/core/shared/inversify';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

const ErrorDetail = z.object({
    type: z.string(),
    file: z.string().optional(),
    line: z.number().optional(),
    column: z.number().optional(),
    description: z.string(),
    fix: z.string()
});
export type ErrorDetail = z.infer<typeof ErrorDetail>;
const Summary = z.object({
    isSuccessful: z.boolean(),
    outputSummary: z.string(),
    errors: z.array(ErrorDetail)
});
export type Summary = z.infer<typeof Summary>;

@injectable()
export class AiTerminalSummaryAgent implements Agent {

    id = 'Terminal Summary';
    name = 'Terminal Summary Assistant';
    description = nls.localize('theia/ai/terminal/agent/description', 'This agent provides assistance to provide structured terminal output summaries. \
        It accesses the current directory, environment and the recent terminal output of the terminal session to provide context-aware assistance');
    variables = [];
    functions = [];
    agentSpecificVariables = [
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
            purpose: 'summarize-terminal-output',
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

    async getSummary(
        cwd: string,
        shell: string,
        recentTerminalContents: string[],
    ): Promise<Summary | undefined> {
        const lm = await this.languageModelRegistry.selectLanguageModel({
            agent: this.id,
            ...this.languageModelRequirements[0]
        });
        if (!lm) {
            this.logger.error('No language model available for the AI Terminal Agent.');
            return undefined;
        }

        const parameters = {
            shell,
            cwd,
            recentTerminalContents
        };

        const systemMessage = await this.promptService.getResolvedPromptFragment('terminal-summary-system', parameters).then(p => p?.text);
        const request = await this.promptService.getResolvedPromptFragment('terminal-summary-user', parameters).then(p => p?.text);
        if (!systemMessage || !request) {
            this.logger.error('The prompt service didn\'t return prompts for the AI Terminal Agent.');
            return undefined;
        }

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
                    name: 'terminal-output-summary',
                    description: 'Structured summary of terminal output commands',
                    schema: zodToJsonSchema(Summary)
                }
            },
            agentId: this.id,
            requestId,
            sessionId
        };

        try {
            const result = await this.languageModelService.sendRequest(lm, llmRequest);

            if (isLanguageModelParsedResponse(result)) {
                // model returned structured output
                const parsedResult = Summary.safeParse(result.parsed);
                if (parsedResult.success) {
                    return parsedResult.data;
                }
            }

            // fall back to agent-based parsing of result
            const jsonResult = await getJsonOfResponse(result);
            const parsedJsonResult = Summary.safeParse(jsonResult);
            if (parsedJsonResult.success) {
                return parsedJsonResult.data;
            }

            return undefined;

        } catch (error) {
            this.logger.error('Error obtaining the command output summary.', error);
            return undefined;
        }
    }

}
