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
import { ChatAgentService } from '@theia/ai-chat';
import { CommunicationRecordingService } from '@theia/ai-core';
import { codicon, ReactWidget } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

@injectable()
export class AIHistoryView extends ReactWidget {
    @inject(ChatAgentService)
    protected agentService: ChatAgentService;
    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    public static ID = 'ai-history-widget';
    static LABEL = 'AI Agent History';

    protected historyContent: string = '';

    constructor() {
        super();
        this.id = AIHistoryView.ID;
        this.title.label = AIHistoryView.LABEL;
        this.title.caption = AIHistoryView.LABEL;
        this.title.closable = true;
        this.title.iconClass = codicon('history');

        this.update();
    }

    render(): React.ReactNode {
        return (
            <div>
                <div id="agent-list" style={{ whiteSpace: 'pre-wrap', backgroundColor: '#f6f8fa', border: '1px solid #ddd', padding: '10px', fontFamily: 'monospace' }}>
                    <ul>{this.agentService.getAgents().map(agent => <li
                        style={{
                            display: 'inline-block',
                            marginRight: '10px',
                            padding: '10px 20px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            transition: 'background-color 0.3s ease',
                            textDecoration: 'none'
                        }}

                    ><div id={agent.id} onClick={this.onClick.bind(this)}>{agent.name}</div></li>)
                    }</ul>
                </div>
                <div id="history-content" style={{ whiteSpace: 'pre-wrap', backgroundColor: '#f6f8fa', border: '1px solid #ddd', padding: '10px', fontFamily: 'monospace' }}>
                    {this.historyContent}
                </div>
            </div >
        );
    }

    protected onClick(e: React.MouseEvent<HTMLDivElement>): void {
        e.stopPropagation();
        const agent = this.agentService.getAgent(e.currentTarget.id);
        if (agent) {
            this.historyContent = JSON.stringify(this.recordingService.getHistory(agent.id), undefined, 2);
        }
        this.update();
    }
}
