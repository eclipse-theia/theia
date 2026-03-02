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

import { LanguageModelService } from '@theia/ai-core/lib/browser';
import {
    Agent, AgentSpecificVariables, getTextOfResponse,
    LanguageModelRegistry, LanguageModelRequirement, PromptService,
    PromptVariantSet,
    UserRequest
} from '@theia/ai-core/lib/common';
import { generateUuid, ILogger, nls, ProgressService } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { codeCompletionPrompts } from './code-completion-prompt-template';
import { CodeCompletionPostProcessor } from './code-completion-postprocessor';
import { CodeCompletionVariableContext } from './code-completion-variable-context';
import { FILE, LANGUAGE, PREFIX, SUFFIX } from './code-completion-variables';

export const CodeCompletionAgent = Symbol('CodeCompletionAgent');
export interface CodeCompletionAgent extends Agent {
    provideInlineCompletions(model: monaco.editor.ITextModel, position: monaco.Position,
        context: monaco.languages.InlineCompletionContext, token: monaco.CancellationToken): Promise<monaco.languages.InlineCompletions | undefined>
}

@injectable()
export class CodeCompletionAgentImpl implements CodeCompletionAgent {
    @inject(LanguageModelService)
    protected languageModelService: LanguageModelService;

    async provideInlineCompletions(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        context: monaco.languages.InlineCompletionContext,
        token: monaco.CancellationToken
    ): Promise<monaco.languages.InlineCompletions | undefined> {
        const progress = await this.progressService.showProgress(
            { text: nls.localize('theia/ai/code-completion/progressText', 'Calculating AI code completion...'), options: { location: 'window' } }
        );
        try {
            const languageModel =
                await this.languageModelRegistry.selectLanguageModel({
                    agent: this.id,
                    ...this.languageModelRequirements[0],
                });
            if (!languageModel) {
                this.logger.error(
                    'No language model found for code-completion-agent'
                );
                return undefined;
            }

            const variableContext: CodeCompletionVariableContext = {
                model,
                position,
                context
            };

            if (token.isCancellationRequested) {
                return undefined;
            }
            const prompt = await this.promptService
                .getResolvedPromptFragment('code-completion-system', undefined, variableContext)
                .then(p => p?.text);
            if (!prompt) {
                this.logger.error('No prompt found for code-completion-agent');
                return undefined;
            }

            const variantInfo = this.promptService.getPromptVariantInfo('code-completion-system');

            // since we do not actually hold complete conversions, the request/response pair is considered a session
            const sessionId = generateUuid();
            const requestId = generateUuid();
            const request: UserRequest = {
                messages: [{ type: 'text', actor: 'user', text: prompt }],
                settings: {
                    stream: false
                },
                agentId: this.id,
                sessionId,
                requestId,
                cancellationToken: token,
                promptVariantId: variantInfo?.variantId,
                isPromptVariantCustomized: variantInfo?.isCustomized
            };
            if (token.isCancellationRequested) {
                return undefined;
            }
            const response = await this.languageModelService.sendRequest(languageModel, request);
            if (token.isCancellationRequested) {
                return undefined;
            }
            const completionText = await getTextOfResponse(response);
            if (token.isCancellationRequested) {
                return undefined;
            }

            const postProcessedCompletionText = this.postProcessor.postProcess(completionText);

            return {
                items: [{
                    insertText: postProcessedCompletionText,
                    range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
                }],
                enableForwardStability: true
            };
        } catch (e) {
            if (!token.isCancellationRequested) {
                console.error(e.message, e);
            }
        }
        finally {
            progress.cancel();
        }
    }

    @inject(ILogger)
    @named('code-completion-agent')
    protected logger: ILogger;

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(PromptService)
    protected promptService: PromptService;

    @inject(ProgressService)
    protected progressService: ProgressService;

    @inject(CodeCompletionPostProcessor)
    protected postProcessor: CodeCompletionPostProcessor;

    id = 'Code Completion';
    name = 'Code Completion';
    description =
        nls.localize('theia/ai/completion/agent/description', 'This agent provides inline code completion in the code editor in the Theia IDE.');
    prompts: PromptVariantSet[] = codeCompletionPrompts;
    languageModelRequirements: LanguageModelRequirement[] = [
        {
            purpose: 'code-completion',
            identifier: 'default/code-completion',
        },
    ];
    readonly variables: string[] = [];
    readonly functions: string[] = [];
    readonly agentSpecificVariables: AgentSpecificVariables[] = [
        { name: FILE.id, description: nls.localize('theia/ai/completion/agent/vars/file/description', 'The URI of the file being edited'), usedInPrompt: true },
        { name: PREFIX.id, description: nls.localize('theia/ai/completion/agent/vars/prefix/description', 'The code before the current cursor position'), usedInPrompt: true },
        { name: SUFFIX.id, description: nls.localize('theia/ai/completion/agent/vars/suffix/description', 'The code after the current cursor position'), usedInPrompt: true },
        { name: LANGUAGE.id, description: nls.localize('theia/ai/completion/agent/vars/language/description', 'The languageId of the file being edited'), usedInPrompt: true }
    ];
}
