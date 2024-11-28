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

import { AgentService, CustomAgentDescription, PromptCustomizationService } from '@theia/ai-core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatAgentService } from '../common';
import { CustomAgentFactory } from './custom-agent-factory';

@injectable()
export class AICustomAgentsFrontendApplicationContribution implements FrontendApplicationContribution {
    @inject(CustomAgentFactory)
    protected readonly customAgentFactory: CustomAgentFactory;

    @inject(PromptCustomizationService)
    protected readonly customizationService: PromptCustomizationService;

    @inject(AgentService)
    private readonly agentService: AgentService;

    @inject(ChatAgentService)
    private readonly chatAgentService: ChatAgentService;

    private knownCustomAgents: Map<string, CustomAgentDescription> = new Map();
    onStart(): void {
        this.customizationService?.getCustomAgents().then(customAgents => {
            customAgents.forEach(agent => {
                this.customAgentFactory(agent.id, agent.name, agent.description, agent.prompt, agent.defaultLLM);
                this.knownCustomAgents.set(agent.id, agent);
            });
        }).catch(e => {
            console.error('Failed to load custom agents', e);
        });
        this.customizationService?.onDidChangeCustomAgents(() => {
            this.customizationService?.getCustomAgents().then(customAgents => {
                const customAgentsToAdd = customAgents.filter(agent =>
                    !this.knownCustomAgents.has(agent.id) || !CustomAgentDescription.equals(this.knownCustomAgents.get(agent.id)!, agent));
                const customAgentIdsToRemove = [...this.knownCustomAgents.values()].filter(agent =>
                    !customAgents.find(a => CustomAgentDescription.equals(a, agent))).map(a => a.id);

                // delete first so we don't have to deal with the case where we add and remove the same agentId
                customAgentIdsToRemove.forEach(id => {
                    this.chatAgentService.unregisterChatAgent(id);
                    this.agentService.unregisterAgent(id);
                    this.knownCustomAgents.delete(id);
                });
                customAgentsToAdd
                    .forEach(agent => {
                        this.customAgentFactory(agent.id, agent.name, agent.description, agent.prompt, agent.defaultLLM);
                        this.knownCustomAgents.set(agent.id, agent);
                    });
            }).catch(e => {
                console.error('Failed to load custom agents', e);
            });
        });
    }

    onStop(): void {
    }
}
