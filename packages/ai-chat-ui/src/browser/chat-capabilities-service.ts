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
import {
    PromptService,
    parseCapabilitiesFromTemplate,
    ParsedCapability,
    GenericCapabilitySelections,
    matchFunctionsRegEx,
    matchVariablesRegEx
} from '@theia/ai-core';
import { ChatAgentService } from '@theia/ai-chat';

export const ChatCapabilitiesService = Symbol('ChatCapabilitiesService');

/**
 * Service to retrieve capability information for chat agents.
 * Parses capability variables from agent prompt templates.
 */
export interface ChatCapabilitiesService {
    /**
     * Event fired when prompt fragments change, indicating that capabilities may need to be refreshed.
     */
    readonly onDidChangeCapabilities: Event<void>;

    /**
     * Gets capabilities for a specific agent, optionally with a specific mode.
     * Parses the agent's effective prompt template to extract capability variables.
     *
     * @param agentId The agent ID to get capabilities for
     * @param modeId Optional mode ID to use instead of the default
     * @returns Array of parsed capabilities in order they appear in the template
     */
    getCapabilitiesForAgent(agentId: string, modeId?: string): Promise<ParsedCapability[]>;

    /**
     * Extracts generic capabilities that are already used in an agent's prompt template.
     * Used to disable these items in the dropdown (they're already included).
     *
     * @param agentId The agent ID to get capabilities for
     * @param modeId Optional mode ID to use instead of the default
     * @returns GenericCapabilitySelections containing IDs of capabilities already in the prompt
     */
    getUsedGenericCapabilitiesForAgent(agentId: string, modeId?: string): Promise<GenericCapabilitySelections>;
}

@injectable()
export class ChatCapabilitiesServiceImpl implements ChatCapabilitiesService {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    @inject(ChatAgentService)
    protected readonly chatAgentService: ChatAgentService;

    protected readonly onDidChangeCapabilitiesEmitter = new Emitter<void>();

    readonly onDidChangeCapabilities: Event<void> = this.onDidChangeCapabilitiesEmitter.event;

    @postConstruct()
    protected init(): void {
        this.promptService.onPromptsChange(() => {
            this.onDidChangeCapabilitiesEmitter.fire();
        });
    }

    async getCapabilitiesForAgent(agentId: string, modeId?: string): Promise<ParsedCapability[]> {
        const template = this.getAgentTemplate(agentId, modeId);
        const capabilities = template ? parseCapabilitiesFromTemplate(template) : [];
        return capabilities.map(cap => {
            const fragment = this.promptService.getRawPromptFragment(cap.fragmentId);
            return {
                ...cap,
                name: fragment?.name,
                description: fragment?.description,
            };
        });
    }

    async getUsedGenericCapabilitiesForAgent(agentId: string, modeId?: string): Promise<GenericCapabilitySelections> {
        const template = this.getAgentTemplate(agentId, modeId);
        return template ? this.extractUsedGenericCapabilities(template) : {};
    }

    protected getAgentTemplate(agentId: string, modeId?: string): string | undefined {
        const agent = this.chatAgentService.getAgent(agentId);
        if (!agent?.prompts || agent.prompts.length === 0) {
            return undefined;
        }

        const variantInfo = this.promptService.getPromptVariantInfo(agent.prompts[0].id, modeId);
        return variantInfo
            ? this.promptService.getRawPromptFragment(variantInfo.variantId)?.template
            : undefined;
    }

    /**
     * Extracts generic capabilities that are already referenced in a prompt template.
     * Returns all function and variable IDs without distinguishing types.
     * These are used to disable items in the dropdown since they're already included.
     */
    protected extractUsedGenericCapabilities(template: string): GenericCapabilitySelections {
        const functions: string[] = [];
        const variables: string[] = [];

        // Extract all functions using the standard regex
        const functionMatches = matchFunctionsRegEx(template);
        for (const match of functionMatches) {
            functions.push(match[1]);
        }

        // Extract all variables using the standard regex
        const variableMatches = matchVariablesRegEx(template);
        for (const match of variableMatches) {
            const variableAndArg = match[1];
            const parts = variableAndArg.split(':', 2);
            const variableName = parts[0];

            // Exclude capability and selected_* variables (they're meta-variables)
            if (variableName !== 'capability' &&
                variableName !== 'skills' &&
                !variableName.startsWith('selected_')) {
                variables.push(variableName);
            }
        }

        return { functions, variables };
    }
}
