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
import { Agent, AgentService, CommunicationRecordingService, CommunicationRequestEntry, CommunicationResponseEntry } from '@theia/ai-core';
import { codicon, ReactWidget, StatefulWidget } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { CommunicationCard } from './ai-history-communication-card';
import { SelectComponent, SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import { deepClone, Emitter } from '@theia/core';

namespace AIHistoryView {
    export interface State {
        chronological: boolean;
    }
}

@injectable()
export class AIHistoryView extends ReactWidget implements StatefulWidget {
    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;
    @inject(AgentService)
    protected readonly agentService: AgentService;

    public static ID = 'ai-history-widget';
    static LABEL = '✨ AI Agent History [Experimental]';

    protected selectedAgent?: Agent;

    protected _state: AIHistoryView.State = { chronological: false };
    protected readonly onStateChangedEmitter = new Emitter<AIHistoryView.State>();
    readonly onStateChanged = this.onStateChangedEmitter.event;

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
        this.onStateChangedEmitter.fire(this._state);
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
        this.toDispose.push(this.recordingService.onDidRecordRequest(entry => this.historyContentUpdated(entry)));
        this.toDispose.push(this.recordingService.onDidRecordResponse(entry => this.historyContentUpdated(entry)));
        this.toDispose.push(this.recordingService.onStructuralChange(() => this.update()));
        this.toDispose.push(this.onStateChanged(newState => this.update()));
        this.selectAgent(this.agentService.getAllAgents()[0]);
    }

    protected selectAgent(agent: Agent | undefined): void {
        this.selectedAgent = agent;
        this.update();
    }

    protected historyContentUpdated(entry: CommunicationRequestEntry | CommunicationResponseEntry): void {
        if (entry.agentId === this.selectedAgent?.id) {
            this.update();
        }
    }

    render(): React.ReactNode {
        const selectionChange = (value: SelectOption) => {
            this.selectedAgent = this.agentService.getAllAgents().find(agent => agent.id === value.value);
            this.update();
        };
        return (
            <div className='agent-history-widget'>
                <SelectComponent
                    options={this.agentService.getAllAgents().map(agent => ({ value: agent.id, label: agent.name, description: agent.description }))}
                    onChange={selectionChange}
                    defaultValue={this.selectedAgent?.id} />
                <div className='agent-history'>
                    {this.renderHistory()}
                </div>
            </div >
        );
    }

    protected renderHistory(): React.ReactNode {
        if (!this.selectedAgent) {
            return <div className='theia-card no-content'>No agent selected.</div>;
        }
        const history = [...this.recordingService.getHistory(this.selectedAgent.id)];
        if (history.length === 0) {
            return <div className='theia-card no-content'>No history available for the selected agent '{this.selectedAgent.name}'.</div>;
        }
        if (!this.state.chronological) {
            history.reverse();
        }
        return history.map(entry => <CommunicationCard key={entry.requestId} entry={entry} />);
    }

    protected onClick(e: React.MouseEvent<HTMLDivElement>, agent: Agent): void {
        e.stopPropagation();
        this.selectAgent(agent);
    }

    public sortHistory(chronological: boolean): void {
        this.state = { ...deepClone(this.state), chronological: chronological };
    }

    get isChronological(): boolean {
        return this.state.chronological === true;
    }
}
