// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
    getTextOfResponse,
    LanguageModelRegistry,
    LanguageModelRequirement,
    LanguageModelService,
    PromptService,
    UserRequest
} from '@theia/ai-core';
import { generateUuid, nls } from '@theia/core';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommitMessageScope } from './commit-message-commands';
import { commitMessagePrompts, COMMIT_MESSAGE_SYSTEM_PROMPT_ID, COMMIT_MESSAGE_USER_PROMPT_ID } from './commit-message-prompt-template';

export const COMMIT_MESSAGE_AGENT_ID = 'Commit Message';

@injectable()
export class CommitMessageAgent implements Agent {

    id = COMMIT_MESSAGE_AGENT_ID;
    name = COMMIT_MESSAGE_AGENT_ID;

    description = nls.localize('theia/ai-ide/commitMessageAgent/description',
        'Generates git commit messages from staged or all current changes in the workspace repository. ' +
        'Invoked from the SCM commit-message input via the AI sparkle buttons.');

    variables = [];
    functions = [];

    prompts = commitMessagePrompts;

    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'commit-message',
        identifier: 'default/universal',
    }];

    agentSpecificVariables = [
        {
            name: 'changes',
            usedInPrompt: true,
            description: nls.localize('theia/ai-ide/commitMessageAgent/vars/changes/description', 'The unified git diff the commit message is generated from.')
        },
        {
            name: 'scope',
            usedInPrompt: true,
            description: nls.localize('theia/ai-ide/commitMessageAgent/vars/scope/description', 'Describes which changes the diff covers (e.g. "staged" or "current").')
        }
    ];

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(PromptService)
    protected readonly promptService: PromptService;

    @inject(LanguageModelService)
    protected readonly languageModelService: LanguageModelService;

    /**
     * Generates a commit message from the given unified diff. Returns the trimmed message text.
     *
     * @throws if no language model is available or the prompts cannot be resolved.
     */
    async generateCommitMessage(changes: string, scope: CommitMessageScope, cancellationToken?: CancellationToken): Promise<string> {
        const lm = await this.languageModelRegistry.selectLanguageModel({
            agent: this.id,
            ...this.languageModelRequirements[0]
        });
        if (!lm) {
            throw new Error('No language model available for the Commit Message agent.');
        }

        const parameters = { changes, scope: scope === 'staged' ? 'staged' : 'current' };
        const systemMessage = await this.promptService.getResolvedPromptFragment(COMMIT_MESSAGE_SYSTEM_PROMPT_ID, parameters).then(p => p?.text);
        const userMessage = await this.promptService.getResolvedPromptFragment(COMMIT_MESSAGE_USER_PROMPT_ID, parameters).then(p => p?.text);
        if (!systemMessage || !userMessage) {
            throw new Error('The prompt service did not return prompts for the Commit Message agent.');
        }

        const variantInfo = this.promptService.getPromptVariantInfo(COMMIT_MESSAGE_SYSTEM_PROMPT_ID);

        const request: UserRequest = {
            messages: [
                { actor: 'system', type: 'text', text: systemMessage },
                { actor: 'user', type: 'text', text: userMessage }
            ],
            agentId: this.id,
            sessionId: generateUuid(),
            requestId: generateUuid(),
            cancellationToken,
            promptVariantId: variantInfo?.variantId,
            isPromptVariantCustomized: variantInfo?.isCustomized
        };

        const result = await this.languageModelService.sendRequest(lm, request);
        const text = await getTextOfResponse(result);
        return text.trim();
    }
}
