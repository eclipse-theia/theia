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
import { CommunicationHistoryEntry } from '@theia/ai-core';
import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';

export interface CommunicationCardProps {
    entry: CommunicationHistoryEntry;
}

export const CommunicationCard: React.FC<CommunicationCardProps> = ({ entry }) => (
    <div className='theia-card'>
        <div className='theia-card-meta'>
            <span className='theia-card-request-id'>{nls.localize('theia/ai/history/communication-card/requestId', 'Request ID')}: {entry.requestId}</span>
            <span className='theia-card-session-id'>{nls.localize('theia/ai/history/communication-card/sessionId', 'Session ID')}: {entry.sessionId}</span>
        </div>
        <div className='theia-card-content'>
            {entry.request && (
                <div className='theia-card-request'>
                    <h2>{nls.localize('theia/ai/history/communication-card/request', 'Request')}</h2>
                    <pre>{entry.request}</pre>
                </div>
            )}
            {entry.response && (
                <div className='theia-card-response'>
                    <h2>{nls.localize('theia/ai/history/communication-card/response', 'Response')}</h2>
                    <pre>{entry.response}</pre>
                </div>
            )}
            {(entry.llmRequests && entry.llmRequests.length > 0) && (
                <div className='theia-card-llm-requests'>
                    <h2>{nls.localize('theia/ai/history/communication-card/llmRequests', 'Language Model Requests')}</h2>
                    {entry.llmRequests.map((llmRequest, index) => (
                        <details key={`llmRequest-${index}`}>
                            <summary><h3>{`${nls.localize('theia/ai/history/communication-card/llmRequests/request', 'Request')} ${(index + 1)}`}</h3></summary>
                            {llmRequest.messages && llmRequest.messages.length > 0 && llmRequest.messages && (
                                <div className='theia-card-llm-request-messages'>
                                    <h4>{nls.localize('theia/ai/history/communication-card/llmRequests/request/messages', 'Messages')}</h4>
                                    <ul className='theia-card-llm-request-messages-list'>
                                        {llmRequest.messages.map((message, messageIndex) => (
                                            <li key={`message-${index}-${messageIndex}`}><pre>{JSON.stringify(message, undefined, 2)}</pre></li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {llmRequest.response && (
                                <div className='theia-card-llm-request-response'>
                                    <h4>{nls.localize('theia/ai/history/communication-card/llmRequests/request/response', 'Response')}</h4>
                                    <pre className='theia-card-llm-request-response-text'>{llmRequest.response.text}</pre>
                                    {llmRequest.response.tool_calls && (
                                        <div className='theia-card-llm-request-response-tool-calls'>
                                            <h4>{nls.localize('theia/ai/history/communication-card/llmRequests/request/response/toolCalls', 'Tool Calls')}</h4>
                                            <ul className='theia-card-llm-request-response-tool-calls-list'>
                                                {llmRequest.response.tool_calls.map((toolCall, toolCallIndex) => (
                                                    <li key={`toolCall-${index}-${toolCallIndex}`}><pre>{JSON.stringify(toolCall, undefined, 2)}</pre></li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </details>
                    ))}
                </div>
            )}
        </div>
        <div className='theia-card-meta'>
            <span className='theia-card-timestamp'>{nls.localize('theia/ai/history/communication-card/timestamp', 'Timestamp')}: {new Date(entry.timestamp).toLocaleString()}</span>
            {entry.responseTime &&
                <span className='theia-card-response-time'>{nls.localize('theia/ai/history/communication-card/responseTime', 'Response Time')}: {entry.responseTime}ms</span>}
        </div>
    </div>
);
