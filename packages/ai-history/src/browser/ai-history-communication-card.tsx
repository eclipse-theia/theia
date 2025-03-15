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

export const CommunicationCard: React.FC<CommunicationCardProps> = ({ entry }) => {
    // Format JSON with error handling
    const formatJson = (data: unknown): string => {
        try {
            return JSON.stringify(data, undefined, 2);
        } catch (error) {
            console.error('Error formatting JSON:', error);
            return 'Error formatting data';
        }
    };

    // Format the timestamp for better readability
    const formatTimestamp = (timestamp: number): string =>
        new Date(timestamp).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    ;

    return (
        <div className='theia-card' role="article" aria-label={`Communication log for request ${entry.requestId}`}>
            <div className='theia-card-meta'>
                <span className='theia-card-request-id'>{nls.localize('theia/ai/history/communication-card/requestId', 'Request ID')}: {entry.requestId}</span>
                <span className='theia-card-session-id'>{nls.localize('theia/ai/history/communication-card/sessionId', 'Session ID')}: {entry.sessionId}</span>
            </div>
            <div className='theia-card-content'>
                {entry.request && (
                    <div className='theia-card-request'>
                        <h2>{nls.localize('theia/ai/history/communication-card/request', 'Request')}</h2>
                        <details key={`request-${entry.requestId}`}>
                            <summary>
                                <h3>{nls.localize('theia/ai/history/communication-card/request/summary', 'Request')} {entry.requestId}</h3>
                            </summary>
                            <div className='theia-card-request-messages'>
                                <h4>{nls.localize('theia/ai/history/communication-card/request/messages', 'Messages')}</h4>
                                <ul className='theia-card-request-messages-list'>
                                    {entry.request.map((message, index) => (
                                        <li key={`message-${entry.requestId}-${index}`} className="message-item">
                                            <pre className="message-content">{formatJson(message)}</pre>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </details>
                    </div>
                )}
                {entry.response && (
                    <div className='theia-card-response'>
                        <h2>{nls.localize('theia/ai/history/communication-card/response', 'Response')}</h2>
                        <details key={`response-${entry.requestId}`}>
                            <summary>
                                <h3>{nls.localize('theia/ai/history/communication-card/response/summary', 'Response')} {entry.requestId}</h3>
                            </summary>
                            <div className='theia-card-response-messages'>
                                <h4>{nls.localize('theia/ai/history/communication-card/response/messages', 'Messages')}</h4>
                                <ul className='theia-card-response-messages-list'>
                                    {entry.response.map((message, index) => (
                                        <li key={`message-${entry.requestId}-${index}`} className="message-item">
                                            <pre className="message-content">{formatJson(message)}</pre>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </details>
                    </div>
                )}
            </div>
            <div className='theia-card-meta'>
                <span className='theia-card-timestamp'>
                    {nls.localize('theia/ai/history/communication-card/timestamp', 'Timestamp')}: {formatTimestamp(entry.timestamp)}
                </span>
                {entry.responseTime !== undefined && (
                    <span className='theia-card-response-time'>
                        {nls.localize('theia/ai/history/communication-card/responseTime', 'Response Time')}: {entry.responseTime}ms
                    </span>
                )}
            </div>
        </div>
    );
};
