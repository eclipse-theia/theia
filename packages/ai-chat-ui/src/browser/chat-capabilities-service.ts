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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import { PromptService, parseCapabilitiesFromTemplate, ParsedCapability } from '@theia/ai-core';
import { ChatAgentService, ChatAgent, ChatService, isSessionDeletedEvent } from '@theia/ai-chat';

/**
 * Service to manage capability state for chat sessions.
 * Parses capability variables from agent prompts and tracks user overrides.
 */
@injectable()
export class ChatCapabilitiesServiceImpl {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    @inject(ChatAgentService)
    protected readonly chatAgentService: ChatAgentService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    /**
     * Map of session ID -> Map of fragmentId -> enabled state (override)
     */
    protected readonly sessionOverrides = new Map<string, Map<string, boolean>>();

    protected readonly onDidChangeCapabilitiesEmitter = new Emitter<void>();

    /**
     * Event fired when prompt fragments change, indicating that capabilities may need to be refreshed.
     */
    readonly onDidChangeCapabilities: Event<void> = this.onDidChangeCapabilitiesEmitter.event;

    @postConstruct()
    protected init(): void {
        // Listen for prompt fragment changes and forward them as capability changes
        this.promptService.onPromptsChange(() => {
            this.onDidChangeCapabilitiesEmitter.fire();
        });
        // Clean up session overrides when sessions are deleted
        this.chatService.onSessionEvent(event => {
            if (isSessionDeletedEvent(event)) {
                this.sessionOverrides.delete(event.sessionId);
            }
        });
    }

    /**
     * Gets capabilities for a specific agent, optionally with a specific mode.
     * Parses the agent's effective prompt template to extract capability variables.
     *
     * @param agentId The agent ID to get capabilities for
     * @param modeId Optional mode ID to use instead of the default
     * @returns Array of parsed capabilities in order they appear in the template
     */
    async getCapabilitiesForAgent(agentId: string, modeId?: string): Promise<ParsedCapability[]> {
        const agent = this.chatAgentService.getAgent(agentId);
        if (!agent) {
            return [];
        }

        const promptTemplate = await this.getEffectivePromptTemplate(agent, modeId);
        if (!promptTemplate) {
            return [];
        }

        return parseCapabilitiesFromTemplate(promptTemplate);
    }

    /**
     * Gets the effective prompt template for an agent, considering mode selection.
     */
    protected async getEffectivePromptTemplate(agent: ChatAgent, modeId?: string): Promise<string | undefined> {
        // Check if agent has a prompts array with variant sets
        if (agent.prompts && agent.prompts.length > 0) {
            const variantSet = agent.prompts[0]; // Main system prompt variant set

            // If a mode ID is provided, use it directly as the variant ID
            let effectiveVariantId: string | undefined;
            if (modeId) {
                // Validate that modeId is a valid variant
                const variantIds = this.promptService.getVariantIds(variantSet.id);
                if (variantIds.includes(modeId)) {
                    effectiveVariantId = modeId;
                }
            }

            // Fall back to the settings-based effective variant
            if (!effectiveVariantId) {
                effectiveVariantId = this.promptService.getEffectiveVariantId(variantSet.id);
            }

            if (effectiveVariantId) {
                const fragment = this.promptService.getRawPromptFragment(effectiveVariantId);
                return fragment?.template;
            }
        }

        return undefined;
    }

    /**
     * Gets the current capability overrides for a session.
     *
     * @param sessionId The session ID
     * @returns Map of fragmentId -> enabled state for overridden capabilities
     */
    getCapabilityOverrides(sessionId: string): Map<string, boolean> {
        return this.sessionOverrides.get(sessionId) ?? new Map();
    }

    /**
     * Sets an override for a capability in a session.
     *
     * @param sessionId The session ID
     * @param fragmentId The capability fragment ID
     * @param enabled Whether the capability should be enabled
     */
    setCapabilityOverride(sessionId: string, fragmentId: string, enabled: boolean): void {
        let overrides = this.sessionOverrides.get(sessionId);
        if (!overrides) {
            overrides = new Map();
            this.sessionOverrides.set(sessionId, overrides);
        }
        overrides.set(fragmentId, enabled);
    }

    /**
     * Clears an override for a capability, reverting to the default value.
     *
     * @param sessionId The session ID
     * @param fragmentId The capability fragment ID
     */
    clearCapabilityOverride(sessionId: string, fragmentId: string): void {
        const overrides = this.sessionOverrides.get(sessionId);
        if (overrides) {
            overrides.delete(fragmentId);
            if (overrides.size === 0) {
                this.sessionOverrides.delete(sessionId);
            }
        }
    }

    /**
     * Clears all overrides for a session.
     *
     * @param sessionId The session ID
     */
    clearAllOverrides(sessionId: string): void {
        this.sessionOverrides.delete(sessionId);
    }

    /**
     * Converts the capability overrides for a session to a plain object
     * suitable for passing to the chat request.
     *
     * @param sessionId The session ID
     * @returns Record of fragmentId -> enabled state
     */
    getOverridesAsRecord(sessionId: string): Record<string, boolean> {
        const overrides = this.getCapabilityOverrides(sessionId);
        const record: Record<string, boolean> = {};
        for (const [key, value] of overrides) {
            record[key] = value;
        }
        return record;
    }
}
