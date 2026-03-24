// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

const ErrorLines = z.object({
    errorLines: z.array(z.string()),
    errorLinesStart: z.number()
});
export type ErrorLines = z.infer<typeof ErrorLines>;
const ErrorDetail = z.object({
    type: z.string(),
    file: z.string().optional(),
    line: z.number().optional(),
    column: z.number().optional(),
    errorLines: ErrorLines.optional(),
    explanationSteps: z.array(z.string()),
    fixSteps: z.array(z.string()),
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
        recentTerminalContents: string[],
        shell?: string,
    ): Promise<Summary | undefined> {
        const lm = await this.languageModelRegistry.selectLanguageModel({
            agent: this.id,
            ...this.languageModelRequirements[0]
        });
        if (!lm) {
            this.logger.error('No language model available for the AI Terminal Agent.');
            return undefined;
        }
        console.log(`[AI Terminal Agent] Selected model: id=${lm.id}, name=${lm.name}, vendor=${lm.vendor}`);

        const parameters = {
            cwd,
            recentTerminalContents,
            shell,
        };

        const systemMessage = await this.promptService.getResolvedPromptFragment('terminal-summary-system', parameters).then(p => p?.text);
        const request = await this.promptService.getResolvedPromptFragment('terminal-summary-user', parameters).then(p => p?.text);
        console.log('[AI Terminal Agent] SYSTEM PROMPT:', systemMessage);
        console.log('[AI Terminal Agent] USER PROMPT:', request);
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
                    schema: zodToJsonSchema(Summary as any)
                }
            },
            agentId: this.id,
            requestId,
            sessionId
        };

        try {
            const t0 = performance.now();
            const result = await this.languageModelService.sendRequest(lm, llmRequest);
            const t1 = performance.now();
            console.log(`[AI Terminal Agent] sendRequest completed in ${(t1 - t0).toFixed(0)}ms`);

            if (isLanguageModelParsedResponse(result)) {
                // model returned structured output
                const parsedResult = Summary.safeParse(result.parsed);
                if (parsedResult.success) {
                    console.log(`[AI Terminal Agent] Total time (parsed response): ${(performance.now() - t0).toFixed(0)}ms`);
                    return parsedResult.data;
                }
            }

            // fall back to agent-based parsing of result
            const jsonResult = await getJsonOfResponse(result);
            const t2 = performance.now();
            console.log(`[AI Terminal Agent] getJsonOfResponse completed in ${(t2 - t1).toFixed(0)}ms (total: ${(t2 - t0).toFixed(0)}ms)`);
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
