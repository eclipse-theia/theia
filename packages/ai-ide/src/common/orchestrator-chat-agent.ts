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

import { AIVariableContext, getJsonOfText, getTextOfResponse, LanguageModel, LanguageModelMessage, LanguageModelRequirement, LanguageModelResponse } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ChatToolRequest } from '@theia/ai-chat/lib/common/chat-tool-request-service';
import { AbstractStreamParsingChatAgent, SystemMessageDescription } from '@theia/ai-chat/lib/common/chat-agents';
import { MutableChatRequestModel, InformationalChatResponseContentImpl } from '@theia/ai-chat/lib/common/chat-model';
import { generateUuid, nls, PreferenceService } from '@theia/core';
import { orchestratorTemplate } from './orchestrator-prompt-template';
import { PREFERENCE_NAME_ORCHESTRATOR_EXCLUSION_LIST } from './ai-ide-preferences';

export const OrchestratorChatAgentId = 'Orchestrator';
const OrchestratorRequestIdKey = 'orchestratorRequestIdKey';

@injectable()
export class OrchestratorChatAgent extends AbstractStreamParsingChatAgent {
    id: string = OrchestratorChatAgentId;
    name = OrchestratorChatAgentId;
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'agent-selection',
        identifier: 'default/universal',
    }];
    protected defaultLanguageModelPurpose: string = 'agent-selection';

    override prompts = [orchestratorTemplate];
    override description = nls.localize('theia/ai/chat/orchestrator/description',
        'This agent analyzes the user request against the description of all available chat agents and selects the best fitting agent to answer the request \
    (by using AI).The user\'s request will be directly delegated to the selected agent without further confirmation.');
    override iconClass: string = 'codicon codicon-symbol-boolean';
    override agentSpecificVariables = [{
        name: 'availableChatAgents',
        description: nls.localize('theia/ai/chat/orchestrator/vars/availableChatAgents/description',
            'The list of chat agents that the orchestrator can delegate to, excluding agents specified in the exclusion list preference.'),
        usedInPrompt: true
    }];

    protected override systemPromptId: string = orchestratorTemplate.id;

    private fallBackChatAgentId = 'Universal';

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    protected override async getSystemMessageDescription(context: AIVariableContext): Promise<SystemMessageDescription | undefined> {
        if (this.systemPromptId === undefined) {
            return undefined;
        }

        const excludedAgents = this.preferenceService.get<string[]>(PREFERENCE_NAME_ORCHESTRATOR_EXCLUSION_LIST, ['ClaudeCode', 'Codex']);
        const availableAgents = this.getAvailableAgentsForDelegation(excludedAgents);
        const availableChatAgentsValue = availableAgents.map(agent => prettyPrintAgentInMd(agent)).join('\n');

        const variantInfo = this.promptService.getPromptVariantInfo(this.systemPromptId);

        const resolvedPrompt = await this.promptService.getResolvedPromptFragment(
            this.systemPromptId,
            { availableChatAgents: availableChatAgentsValue },
            context
        );

        return resolvedPrompt ? SystemMessageDescription.fromResolvedPromptFragment(resolvedPrompt, variantInfo?.variantId, variantInfo?.isCustomized) : undefined;
    }

    protected getAvailableAgentsForDelegation(excludedAgents: string[]): Array<{ id: string; name: string; description: string }> {
        return this.chatAgentService.getAgents()
            .filter(agent => agent.id !== this.id && !excludedAgents.includes(agent.id))
            .map(agent => ({
                id: agent.id,
                name: agent.name,
                description: agent.description
            }));
    }

    protected getExcludedAgentIds(): string[] {
        return this.preferenceService.get<string[]>(PREFERENCE_NAME_ORCHESTRATOR_EXCLUSION_LIST, ['ClaudeCode', 'Codex']);
    }

    override async invoke(request: MutableChatRequestModel): Promise<void> {
        request.response.addProgressMessage({ content: nls.localize('theia/ai/ide/orchestrator/progressMessage', 'Determining the most appropriate agent'), status: 'inProgress' });
        // We use a dedicated id for the orchestrator request
        const orchestratorRequestId = generateUuid();
        request.addData(OrchestratorRequestIdKey, orchestratorRequestId);

        return super.invoke(request);
    }

    protected override async sendLlmRequest(
        request: MutableChatRequestModel,
        messages: LanguageModelMessage[],
        toolRequests: ChatToolRequest[],
        languageModel: LanguageModel,
        promptVariantId?: string,
        isPromptVariantCustomized?: boolean
    ): Promise<LanguageModelResponse> {
        const agentSettings = this.getLlmSettings();
        const settings = { ...agentSettings, ...request.session.settings };
        const tools = toolRequests.length > 0 ? toolRequests : undefined;
        const subRequestId = request.getDataByKey<string>(OrchestratorRequestIdKey) ?? request.id;
        request.removeData(OrchestratorRequestIdKey);
        return this.languageModelService.sendRequest(
            languageModel,
            {
                messages,
                tools,
                settings,
                agentId: this.id,
                sessionId: request.session.id,
                requestId: request.id,
                subRequestId: subRequestId,
                cancellationToken: request.response.cancellationToken,
                promptVariantId,
                isPromptVariantCustomized
            }
        );
    }

    protected override async addContentsToResponse(response: LanguageModelResponse, request: MutableChatRequestModel): Promise<void> {
        const responseText = await getTextOfResponse(response);

        let agentIds: string[] = [];
        const excludedAgents = this.getExcludedAgentIds();

        try {
            const jsonResponse = await getJsonOfText(responseText);
            if (Array.isArray(jsonResponse)) {
                agentIds = jsonResponse.filter((id: string) => id !== this.id && !excludedAgents.includes(id));
            }
        } catch (error: unknown) {
            // The llm sometimes does not return a parseable result
            this.logger.error('Failed to parse JSON response', error);
        }

        if (agentIds.length < 1) {
            this.logger.error('No agent was selected, delegating to fallback chat agent');
            request.response.progressMessages.forEach(progressMessage =>
                request.response.updateProgressMessage({ ...progressMessage, status: 'failed' })
            );
            agentIds = [this.fallBackChatAgentId];
        }

        // check if selected (or fallback) agent exists and is not excluded
        if (!this.chatAgentService.getAgent(agentIds[0]) || excludedAgents.includes(agentIds[0])) {
            this.logger.error(`Chat agent ${agentIds[0]} not found or excluded. Falling back to first available agent.`);
            const firstRegisteredAgent = this.chatAgentService.getAgents()
                .filter(a => a.id !== this.id && !excludedAgents.includes(a.id))[0]?.id;
            if (firstRegisteredAgent) {
                agentIds = [firstRegisteredAgent];
            } else {
                throw new Error(nls.localize('theia/ai/ide/orchestrator/error/noAgents',
                    'No chat agent available to handle request. Please check your configuration whether any are enabled.'));
            }
        }

        // TODO support delegating to more than one agent
        const delegatedToAgent = agentIds[0];
        request.response.response.addContent(new InformationalChatResponseContentImpl(
            `*Orchestrator*: ${nls.localize('theia/ai/ide/orchestrator/response/delegatingToAgent', 'Delegating to \`@{0}\`', delegatedToAgent)}

            ---

            `
        ));
        request.response.overrideAgentId(delegatedToAgent);
        request.response.progressMessages.forEach(progressMessage =>
            request.response.updateProgressMessage({ ...progressMessage, status: 'completed' })
        );
        const agent = this.chatAgentService.getAgent(delegatedToAgent);
        if (!agent) {
            throw new Error(`Chat agent ${delegatedToAgent} not found.`);
        }

        // Get the original request if available
        const originalRequest = '__originalRequest' in request ? request.__originalRequest as MutableChatRequestModel : request;
        await agent.invoke(originalRequest);
    }
}

function prettyPrintAgentInMd(agent: { id: string; name: string; description: string }): string {
    return `- ${agent.id}
  - *ID*: ${agent.id}
  - *Name*: ${agent.name}
  - *Description*: ${agent.description.replace(/\n/g, ' ')}`;
}
