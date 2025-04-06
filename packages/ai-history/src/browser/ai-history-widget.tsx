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
import { Agent, AgentService, LanguageModelService, SessionEvent } from '@theia/ai-core';
import { AiSemanticRequest } from '@theia/ai-core/lib/common/language-model-interaction-model';
import { codicon, ReactWidget, StatefulWidget } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { SemanticRequestCard } from './ai-history-semantic-request-card';
import { SelectComponent, SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import { deepClone, nls } from '@theia/core';

namespace AIHistoryView {
    export interface State {
        chronological: boolean;
        selectedAgentId?: string;
    }
}

@injectable()
export class AIHistoryView extends ReactWidget implements StatefulWidget {
    @inject(LanguageModelService)
    protected languageModelService: LanguageModelService;
    @inject(AgentService)
    protected readonly agentService: AgentService;

    public static ID = 'ai-history-widget';
    static LABEL = nls.localize('theia/ai/history/view/label', 'AI Agent History [Alpha]');

    protected _state: AIHistoryView.State = { chronological: false };

    constructor() {
        super();
        this.id = AIHistoryView.ID;
        this.title.label = AIHistoryView.LABEL;
        this.title.caption = AIHistoryView.LABEL;
        this.title.closable = true;
        this.title.iconClass = codicon('history');
    }

    protected get state(): AIHistoryView.State {
        return this._state;
    }

    protected set state(state: AIHistoryView.State) {
        this._state = state;
        this.update();
    }

    storeState(): object {
        return this.state;
    }

    restoreState(oldState: object & Partial<AIHistoryView.State>): void {
        const copy = deepClone(this.state);
        if (oldState.chronological) {
            copy.chronological = oldState.chronological;
        }
        this.state = copy;
    }

    @postConstruct()
    protected init(): void {
        this.update();
        this.toDispose.push(this.languageModelService.onSessionChanged((event: SessionEvent) => this.historyContentUpdated(event)));
        this.selectAgent(this.agentService.getAllAgents()[0]);
    }

    protected selectAgent(agent: Agent | undefined): void {
        this.state = { ...this.state, selectedAgentId: agent?.id };
    }

    protected historyContentUpdated(event: SessionEvent): void {
        this.update();
    }

    render(): React.ReactNode {
        const selectionChange = (value: SelectOption) => {
            this.selectAgent(this.agentService.getAllAgents().find(agent => agent.id === value.value));
        };
        const agents = this.agentService.getAllAgents();
        if (agents.length === 0) {
            return (
                <div className='agent-history-widget'>
                    <div className='theia-card no-content'>{nls.localize('theia/ai/history/view/noAgent', 'No agent available.')}</div>
                </div >);
        }
        return (
            <div className='agent-history-widget'>
                <SelectComponent
                    options={agents.map(agent => ({
                        value: agent.id,
                        label: agent.name,
                        description: agent.description || ''
                    }))}
                    onChange={selectionChange}
                    defaultValue={this.state.selectedAgentId} />
                <div className='agent-history'>
                    {this.renderHistory()}
                </div>
            </div>
        );
    }

    protected renderHistory(): React.ReactNode {
        if (!this.state.selectedAgentId) {
            return <div className='theia-card no-content'>{nls.localize('theia/ai/history/view/noAgentSelected', 'No agent selected.')}</div>;
        }

        const semanticRequests = this.getSemanticRequestsByAgent(this.state.selectedAgentId);

        if (semanticRequests.length === 0) {
            const selectedAgent = this.agentService.getAllAgents().find(agent => agent.id === this.state.selectedAgentId);
            return <div className='theia-card no-content'>
                {nls.localize('theia/ai/history/view/noHistoryForAgent', 'No history available for the selected agent \'{0}\'', selectedAgent?.name || this.state.selectedAgentId)}
            </div>;
        }

        // Sort requests by timestamp (using the first sub-request's timestamp)
        const sortedRequests = [...semanticRequests].sort((a, b) => {
            const aTimestamp = a.requests[0]?.metadata.timestamp as number || 0;
            const bTimestamp = b.requests[0]?.metadata.timestamp as number || 0;
            return this.state.chronological ? aTimestamp - bTimestamp : bTimestamp - aTimestamp;
        });

        return sortedRequests.map(request => <SemanticRequestCard key={request.id} semanticRequest={request} selectedAgentId={this.state.selectedAgentId} />);
    }

    /**
     * Get all semantic requests for a specific agent.
     * Includes all requests in which the agent is involved, either as the main request or as a sub-request.
     * @param agentId The agent ID to filter by
     */
    protected getSemanticRequestsByAgent(agentId: string): AiSemanticRequest[] {
        return this.languageModelService.sessions.flatMap(session =>
            session.requests.filter(request =>
                request.metadata.agent === agentId ||
                request.requests.some(subRequest => subRequest.metadata.agent === agentId)
            )
        );
    }

    public sortHistory(chronological: boolean): void {
        this.state = { ...deepClone(this.state), chronological: chronological };
    }

    get isChronological(): boolean {
        return this.state.chronological === true;
    }
}
