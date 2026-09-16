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

import { ChatService } from '@theia/ai-chat/lib/common';
import { DEFAULT_CHAT_AGENT_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { DEFAULT_TOOL_CONFIRMATION_PREFERENCE, TOOL_CONFIRMATION_PREFERENCE } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { FrontendLanguageModelRegistry } from '@theia/ai-core/lib/common';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';

/** True as soon as at least one language model is ready to be used. */
export const AI_MODEL_READY_CONTEXT_KEY = 'ai.hasReadyLanguageModel';
/** True as soon as the user has held at least one conversation with an agent. */
export const AI_CHAT_USED_CONTEXT_KEY = 'ai.chat.hasRequest';
/** True while a default chat agent is configured. */
export const AI_DEFAULT_AGENT_CONTEXT_KEY = 'ai.chat.hasDefaultAgent';
/** True once the user has decided how tool calls are confirmed, instead of staying on the default. */
export const AI_TOOL_CONFIRMATION_CONFIGURED_CONTEXT_KEY = 'ai.chat.toolConfirmationConfigured';

/**
 * Publishes the state that the getting started walkthrough observes to tick off its steps.
 *
 * The keys describe what the user achieved rather than what they clicked. A step is therefore only completed
 * once the setup actually works, and a user who configured everything before ever opening the walkthrough
 * finds it completed rather than waiting for changes that already happened.
 */
@injectable()
export class AiWalkthroughContextKeys implements FrontendApplicationContribution {

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(FrontendLanguageModelRegistry)
    protected readonly languageModelRegistry: FrontendLanguageModelRegistry;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected readonly toDispose = new DisposableCollection();

    protected hasReadyLanguageModel: ContextKey<boolean>;
    protected hasChatRequest: ContextKey<boolean>;
    protected hasDefaultAgent: ContextKey<boolean>;
    protected toolConfirmationConfigured: ContextKey<boolean>;

    @postConstruct()
    protected init(): void {
        this.hasReadyLanguageModel = this.contextKeyService.createKey(AI_MODEL_READY_CONTEXT_KEY, false);
        this.hasChatRequest = this.contextKeyService.createKey(AI_CHAT_USED_CONTEXT_KEY, false);
        this.hasDefaultAgent = this.contextKeyService.createKey(AI_DEFAULT_AGENT_CONTEXT_KEY, false);
        this.toolConfirmationConfigured = this.contextKeyService.createKey(AI_TOOL_CONFIRMATION_CONFIGURED_CONTEXT_KEY, false);

        this.toDispose.push(this.languageModelRegistry.onChange(() => this.updateModelState()));
        this.toDispose.push(this.chatService.onSessionEvent(() => this.updateChatState()));
        this.toDispose.push(this.preferenceService.onPreferenceChanged(event => {
            if (event.preferenceName === DEFAULT_CHAT_AGENT_PREF) {
                this.updateDefaultAgentState();
            } else if (event.preferenceName === DEFAULT_TOOL_CONFIRMATION_PREFERENCE || event.preferenceName === TOOL_CONFIRMATION_PREFERENCE) {
                this.updateToolConfirmationState();
            }
        }));

        this.updateModelState();
        this.updateChatState();
        this.preferenceService.ready.then(() => {
            this.updateDefaultAgentState();
            this.updateToolConfirmationState();
        });
    }

    protected async updateModelState(): Promise<void> {
        const models = await this.languageModelRegistry.getLanguageModels();
        this.hasReadyLanguageModel.set(models.some(model => model.status.status === 'ready'));
    }

    /**
     * A session gets its title from its first exchange, so a titled or persisted session means the user has
     * asked something. Once true, the key stays true: the achievement does not go away when a chat is deleted.
     */
    protected async updateChatState(): Promise<void> {
        if (this.hasChatRequest.get()) {
            return;
        }
        if (this.chatService.getSessions().some(session => !!session.title)) {
            this.hasChatRequest.set(true);
            return;
        }
        try {
            if (await this.chatService.hasPersistedSessions()) {
                this.hasChatRequest.set(true);
            }
        } catch {
            // The persisted sessions cannot be read; the key is updated again on the next session event.
        }
    }

    protected updateDefaultAgentState(): void {
        this.hasDefaultAgent.set(!!this.preferenceService.get<string>(DEFAULT_CHAT_AGENT_PREF, ''));
    }

    /**
     * The user has taken a stance on tool confirmation as soon as they changed the default mode or
     * pre-approved individual tools.
     */
    protected updateToolConfirmationState(): void {
        this.toolConfirmationConfigured.set(
            this.isSetByUser(DEFAULT_TOOL_CONFIRMATION_PREFERENCE) || this.isSetByUser(TOOL_CONFIRMATION_PREFERENCE)
        );
    }

    /**
     * Whether a preference carries a value the user set, rather than the one the product ships.
     *
     * The effective value cannot answer this: a product is free to ship its own confirmation defaults, and
     * reading those back as a decision would tick the step for a user who never saw it. An empty object does
     * not count either, since that is what resetting the per-tool settings leaves behind.
     */
    protected isSetByUser(preferenceName: string): boolean {
        const inspection = this.preferenceService.inspect(preferenceName);
        return [inspection?.globalValue, inspection?.workspaceValue, inspection?.workspaceFolderValue].some(
            value => value !== undefined && !(typeof value === 'object' && Object.keys(value as object).length === 0)
        );
    }

    onStop(): void {
        this.toDispose.dispose();
    }
}
