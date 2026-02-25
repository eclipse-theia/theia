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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Partially copied from https://github.com/microsoft/vscode/blob/a2cab7255c0df424027be05d58e1b7b941f4ea60/src/vs/workbench/contrib/chat/common/chatAgents.ts

import { ContributionProvider, Emitter, Event, ILogger, PreferenceService } from '@theia/core';
import { inject, injectable, named, optional, postConstruct } from '@theia/core/shared/inversify';
import { ChatAgent } from './chat-agents';
import { AgentService, AISettingsService } from '@theia/ai-core';
import { ParsedChatRequest, ParsedChatRequestAgentPart } from './parsed-chat-request';
import { DEFAULT_CHAT_AGENT_PREF } from './ai-chat-preferences';

/**
 * The default chat agent to invoke
 */
export const DefaultChatAgentId = Symbol('DefaultChatAgentId');
export interface DefaultChatAgentId {
    id: string;
}

/**
 * In case no fitting chat agent is available, this one will be used (if it is itself available)
 */
export const FallbackChatAgentId = Symbol('FallbackChatAgentId');
export interface FallbackChatAgentId {
    id: string;
}

export const ChatAgentService = Symbol('ChatAgentService');
export const ChatAgentServiceFactory = Symbol('ChatAgentServiceFactory');
/**
 * The ChatAgentService provides access to the available chat agents.
 */
export interface ChatAgentService {
    /**
     * Returns all available agents.
     */
    getAgents(): ChatAgent[];
    /**
     * Returns the specified agent, if available
     */
    getAgent(id: string): ChatAgent | undefined;
    /**
     * Returns all agents, including disabled ones.
     */
    getAllAgents(): ChatAgent[];

    /**
     * Allows to register a chat agent programmatically.
     * @param agent the agent to register
     */
    registerChatAgent(agent: ChatAgent): void;

    /**
     * Allows to unregister a chat agent programmatically.
     * @param agentId the agent id to unregister
     */
    unregisterChatAgent(agentId: string): void;

    /**
     * Returns the configured default chat agent, if available and enabled.
     */
    getDefaultAgent(): ChatAgent | undefined;

    /**
     * Returns the configured fallback chat agent, if available and enabled.
     */
    getFallbackAgent(): ChatAgent | undefined;

    /**
     * Resolves the agent from a parsed request.
     * Checks for explicit @agent mention first, then preference-based default,
     * then DI-bound default, and finally falls back to the fallback agent.
     * @param parsedRequest The parsed chat request to resolve the agent from
     * @returns The resolved agent, or undefined if no agent could be determined
     */
    resolveAgent(parsedRequest: ParsedChatRequest): ChatAgent | undefined;

    /**
     * Returns the user's preference-configured default chat agent, if available and enabled.
     * This takes precedence over the DI-bound default agent.
     */
    getPreferenceDefaultAgent(): ChatAgent | undefined;

    /**
     * Returns the effective default agent by checking preference first, then DI-bound default.
     * @returns The effective default agent, or undefined if none is configured or available
     */
    getEffectiveDefaultAgent(): ChatAgent | undefined;

    /**
     * Fired when an agent is registered or unregistered.
     */
    readonly onDidChangeAgents: Event<void>;

    /**
     * Fired when the effective default agent changes (either through preference change
     * or when the configured agent becomes available/unavailable).
     */
    readonly onDefaultAgentChanged: Event<ChatAgent | undefined>;
}
@injectable()
export class ChatAgentServiceImpl implements ChatAgentService {

    protected readonly onDidChangeAgentsEmitter = new Emitter<void>();
    readonly onDidChangeAgents: Event<void> = this.onDidChangeAgentsEmitter.event;

    protected readonly onDefaultAgentChangedEmitter = new Emitter<ChatAgent | undefined>();
    readonly onDefaultAgentChanged: Event<ChatAgent | undefined> = this.onDefaultAgentChangedEmitter.event;

    @inject(ContributionProvider) @named(ChatAgent)
    protected readonly agentContributions: ContributionProvider<ChatAgent>;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(PreferenceService) @optional()
    protected readonly preferenceService: PreferenceService | undefined;

    @inject(DefaultChatAgentId) @optional()
    protected readonly defaultChatAgentId: DefaultChatAgentId | undefined;

    @inject(FallbackChatAgentId) @optional()
    protected readonly fallbackChatAgentId: FallbackChatAgentId | undefined;

    @inject(AISettingsService) @optional()
    protected readonly aiSettingsService: AISettingsService | undefined;

    protected _agents: ChatAgent[] = [];

    protected hiddenFromChatAgents = new Set<string>();

    protected _cachedPreferenceDefaultAgentId: string | undefined;

    @postConstruct()
    protected init(): void {
        this.aiSettingsService?.getSettings().then(settings => {
            Object.entries(settings).forEach(([agentId, agentSettings]) => {
                if (agentSettings.showInChat === false) {
                    this.hiddenFromChatAgents.add(agentId);
                }
            });
        });
        this.aiSettingsService?.onDidChange(() => {
            this.aiSettingsService?.getSettings().then(settings => {
                this.hiddenFromChatAgents.clear();
                Object.entries(settings).forEach(([agentId, agentSettings]) => {
                    if (agentSettings.showInChat === false) {
                        this.hiddenFromChatAgents.add(agentId);
                    }
                });
            });
        });
        if (this.preferenceService) {
            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === DEFAULT_CHAT_AGENT_PREF) {
                    this.handleDefaultAgentPreferenceChange();
                }
            });
        }
        // Also fire when agents change, as the configured default might become available/unavailable
        this.onDidChangeAgents(() => {
            this.checkAndFireDefaultAgentChange();
        });
    }

    protected handleDefaultAgentPreferenceChange(): void {
        const newAgentId = this.preferenceService?.get<string>(DEFAULT_CHAT_AGENT_PREF, undefined);
        if (newAgentId !== this._cachedPreferenceDefaultAgentId) {
            this._cachedPreferenceDefaultAgentId = newAgentId;
            this.onDefaultAgentChangedEmitter.fire(this.getEffectiveDefaultAgent());
        }
    }

    protected checkAndFireDefaultAgentChange(): void {
        // Fire event when agents change, as this may affect the effective default
        this.onDefaultAgentChangedEmitter.fire(this.getEffectiveDefaultAgent());
    }

    protected get agents(): ChatAgent[] {
        // We can't collect the contributions at @postConstruct because this will lead to a circular dependency
        // with chat agents reusing the chat agent service (e.g. orchestrator)
        return [...this.agentContributions.getContributions(), ...this._agents];
    }

    registerChatAgent(agent: ChatAgent): void {
        this._agents.push(agent);
        this.onDidChangeAgentsEmitter.fire();
    }

    unregisterChatAgent(agentId: string): void {
        this._agents = this._agents.filter(a => a.id !== agentId);
        this.onDidChangeAgentsEmitter.fire();
    }

    getAgent(id: string): ChatAgent | undefined {
        if (!this._agentIsEnabled(id)) {
            return undefined;
        }
        return this.getAgents().find(agent => agent.id === id);
    }
    getAgents(): ChatAgent[] {
        return this.agents.filter(a => this._agentIsEnabled(a.id) && this._agentShowsInChat(a.id));
    }
    getAllAgents(): ChatAgent[] {
        return this.agents;
    }

    private _agentIsEnabled(id: string): boolean {
        return this.agentService.isEnabled(id);
    }

    private _agentShowsInChat(id: string): boolean {
        return !this.hiddenFromChatAgents.has(id);
    }

    getDefaultAgent(): ChatAgent | undefined {
        if (this.defaultChatAgentId) {
            return this.getAgent(this.defaultChatAgentId.id);
        }
        return undefined;
    }

    getFallbackAgent(): ChatAgent | undefined {
        if (this.fallbackChatAgentId) {
            return this.getAgent(this.fallbackChatAgentId.id);
        }
        return undefined;
    }

    getPreferenceDefaultAgent(): ChatAgent | undefined {
        if (!this.preferenceService) {
            return undefined;
        }
        const configuredAgentId = this.preferenceService.get<string>(DEFAULT_CHAT_AGENT_PREF, undefined);
        if (configuredAgentId) {
            const agent = this.getAgent(configuredAgentId);
            if (!agent) {
                this.logger.warn(`The configured default chat agent with id '${configuredAgentId}' does not exist or is disabled.`);
            }
            return agent;
        }
        return undefined;
    }

    getEffectiveDefaultAgent(): ChatAgent | undefined {
        // Check preference-based default first
        const preferenceDefault = this.getPreferenceDefaultAgent();
        if (preferenceDefault) {
            return preferenceDefault;
        }
        // Fall back to DI-bound default
        return this.getDefaultAgent();
    }

    resolveAgent(parsedRequest: ParsedChatRequest): ChatAgent | undefined {
        // First, check for explicitly mentioned agent
        const agentPart = parsedRequest.parts.find(
            (p): p is ParsedChatRequestAgentPart => p instanceof ParsedChatRequestAgentPart
        );
        if (agentPart) {
            return this.getAgent(agentPart.agentId);
        }

        // Fall back to effective default agent (preference > DI-bound)
        const effectiveDefault = this.getEffectiveDefaultAgent();
        if (effectiveDefault) {
            return effectiveDefault;
        }

        // Fall back to fallback agent
        return this.getFallbackAgent();
    }
}
