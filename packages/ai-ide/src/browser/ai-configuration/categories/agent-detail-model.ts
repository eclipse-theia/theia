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

import {
    Agent,
    AgentService,
    AISettingsService,
    AIVariableService,
    FrontendLanguageModelRegistry,
    matchVariablesRegEx,
    PROMPT_FUNCTION_REGEX,
    ParsedCapability,
    parseCapabilitiesFromTemplate,
    PromptService,
    NotificationType,
    GenericCapabilitySelections,
    ServerToolDescriptor,
    ToolInvocationRegistry,
} from '@theia/ai-core/lib/common';
import { CommandService } from '@theia/core/lib/common/command';
import { ILogger } from '@theia/core';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';

/** The services the agent detail page needs; injected into the owning category and passed down. */
export interface AgentDetailServices {
    readonly agentService: AgentService;
    readonly aiSettingsService: AISettingsService;
    readonly variableService: AIVariableService;
    readonly promptService: PromptService;
    readonly languageModelRegistry: FrontendLanguageModelRegistry;
    readonly toolInvocationRegistry: ToolInvocationRegistry;
    readonly commandService: CommandService;
    readonly settingsRowService: AiSettingsRowService;
    readonly logger: ILogger;
}

export interface ParsedPrompt {
    functions: string[];
    globalVariables: string[];
    agentSpecificVariables: string[];
    capabilities: ParsedCapability[];
}

export interface AgentDetailState {
    parsed: ParsedPrompt;
    showInChat: boolean;
    completionNotification?: NotificationType;
    capabilityOverrides?: Record<string, boolean>;
    genericCapabilitySelections?: GenericCapabilitySelections;
    /** Server tools the agent's model offers, if it declares any; empty/absent hides that section. */
    serverTools?: ServerToolDescriptor[];
    /** Vendor the server tool selections are keyed by, i.e. the vendor of the model offering them. */
    serverToolVendor?: string;
    /** Enabled server tool ids per vendor, as stored for this agent. */
    serverToolSelections?: Record<string, string[]>;
}

export async function loadAgentDetail(agent: Agent, services: AgentDetailServices): Promise<AgentDetailState> {
    const parsed = await parsePromptFragments(agent, services);
    const agentSettings = await services.aiSettingsService.getAgentSettings(agent.id);
    const serverToolModel = await resolveServerToolModel(agent, services);
    return {
        parsed,
        showInChat: agentSettings?.showInChat ?? true,
        completionNotification: agentSettings?.completionNotification,
        capabilityOverrides: agentSettings?.capabilityOverrides,
        genericCapabilitySelections: agentSettings?.genericCapabilitySelections,
        serverTools: serverToolModel?.serverTools,
        serverToolVendor: serverToolModel?.vendor,
        serverToolSelections: agentSettings?.serverToolSelections ? { ...agentSettings.serverToolSelections } : undefined
    };
}

/**
 * The model whose provider server tools the agent can use: the first of its requirements that resolves to a
 * model declaring any, mirroring how the chat input picks the model behind its capabilities popup. Server
 * tools are vendor-specific, so the vendor comes from that same model.
 */
async function resolveServerToolModel(agent: Agent, services: AgentDetailServices): Promise<{ serverTools: ServerToolDescriptor[]; vendor?: string } | undefined> {
    for (const requirement of agent.languageModelRequirements ?? []) {
        try {
            const model = await services.languageModelRegistry.selectLanguageModel({ agent: agent.id, ...requirement });
            if (model?.serverTools && model.serverTools.length > 0) {
                return { serverTools: model.serverTools, vendor: model.vendor };
            }
        } catch (error) {
            services.logger.warn('Failed to resolve language model for server tools:', error);
        }
    }
    return undefined;
}

async function parsePromptFragments(agent: Agent, services: AgentDetailServices): Promise<ParsedPrompt> {
    const { aiSettingsService, promptService, variableService } = services;
    const result: ParsedPrompt = { functions: [], globalVariables: [], agentSpecificVariables: [], capabilities: [] };
    const agentSettings = await aiSettingsService.getAgentSettings(agent.id);
    const selectedVariants = agentSettings?.selectedVariants ?? {};

    for (const mainTemplate of agent.prompts) {
        const promptId = selectedVariants[mainTemplate.id] ?? mainTemplate.defaultVariant?.id ?? mainTemplate.id;
        const promptToAnalyze = promptService.getRawPromptFragment(promptId)?.template;
        if (!promptToAnalyze) {
            continue;
        }
        extractVariablesAndFunctions(promptToAnalyze, result, agent, variableService);
        extractCapabilities(promptToAnalyze, result, promptService);
    }
    return result;
}

function extractCapabilities(promptContent: string, result: ParsedPrompt, promptService: PromptService): void {
    const capabilities = parseCapabilitiesFromTemplate(promptContent);
    const existingIds = new Set(result.capabilities.map(c => c.fragmentId));
    for (const capability of capabilities) {
        if (!existingIds.has(capability.fragmentId)) {
            const fragment = promptService.getRawPromptFragment(capability.fragmentId);
            result.capabilities.push({ ...capability, name: fragment?.name, description: fragment?.description });
            existingIds.add(capability.fragmentId);
        }
    }
}

function extractVariablesAndFunctions(promptContent: string, result: ParsedPrompt, agent: Agent, variableService: AIVariableService): void {
    const variableMatches = matchVariablesRegEx(promptContent);
    variableMatches.forEach(match => {
        const variableId = match[1];
        if (variableId.startsWith('!--') || variableId.startsWith('capability:')) {
            return;
        }
        const baseVariableId = variableId.split(':')[0];
        if (variableService.hasVariable(baseVariableId) && agent.agentSpecificVariables.find(v => v.name === baseVariableId) === undefined) {
            result.globalVariables.push(variableId);
        } else {
            result.agentSpecificVariables.push(variableId);
        }
    });
    const functionMatches = [...promptContent.matchAll(PROMPT_FUNCTION_REGEX)];
    functionMatches.forEach(match => result.functions.push(match[1]));
}
