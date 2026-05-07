// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ChatService, ChatAgentService, ChatAgentLocation } from '@theia/ai-chat';
import { AISettingsService, LanguageModelRegistry } from '@theia/ai-core';

@injectable()
export class AITestBridgeContribution implements FrontendApplicationContribution {

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(ChatAgentService)
    protected readonly chatAgentService: ChatAgentService;

    @inject(AISettingsService)
    protected readonly aiSettingsService: AISettingsService;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    onStart(): void {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('test-bridge')) {
            return;
        }

        console.log('[AITestBridge] Test bridge activated');

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const bridge = {
            getAgents: () => self.getAgents(),
            createSession: (agentId?: string) => self.createSession(agentId),
            sendMessage: (sessionId: string, text: string) => self.sendMessage(sessionId, text),
            getConversation: (sessionId: string) => self.getConversation(sessionId),
            getAllConversations: () => self.getAllConversations(),
            getModels: () => self.getModels(),
            setAgentModel: (agentId: string, modelId: string) => self.setAgentModel(agentId, modelId),
        };

        (window as unknown as Record<string, unknown>).__theiaTestBridge = bridge;
    }

    protected getAgents(): { id: string; name: string; description: string }[] {
        return this.chatAgentService.getAgents().map(agent => ({
            id: agent.id,
            name: agent.name,
            description: agent.description,
        }));
    }

    protected createSession(agentId?: string): string {
        const agent = agentId ? this.chatAgentService.getAgent(agentId) : undefined;
        const session = this.chatService.createSession(ChatAgentLocation.Panel, undefined, agent);
        this.chatService.setActiveSession(session.id);
        return session.id;
    }

    protected async sendMessage(sessionId: string, text: string): Promise<unknown> {
        const invocation = await this.chatService.sendRequest(sessionId, { text });
        if (!invocation) {
            throw new Error(`Failed to send request to session ${sessionId}`);
        }
        await invocation.responseCompleted;
        return this.getConversation(sessionId);
    }

    protected getConversation(sessionId: string): unknown {
        const session = this.chatService.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        return session.model.toSerializable();
    }

    protected getAllConversations(): unknown[] {
        return this.chatService.getSessions().map(session => ({
            title: session.title,
            ...session.model.toSerializable(),
        }));
    }

    protected async getModels(): Promise<string[]> {
        const models = await this.languageModelRegistry.getLanguageModels();
        return models.map(m => m.id);
    }

    protected async setAgentModel(agentId: string, modelId: string): Promise<void> {
        await this.aiSettingsService.updateAgentSettings(agentId, {
            languageModelRequirements: [{ purpose: 'chat', identifier: modelId }],
        });
    }

}

export function bindAITestBridgeContribution(bind: interfaces.Bind): void {
    bind(AITestBridgeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(AITestBridgeContribution);
}
