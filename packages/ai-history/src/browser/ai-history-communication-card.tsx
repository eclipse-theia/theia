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
import * as React from '@theia/core/shared/react';

export interface CommunicationCardProps {
    entry: CommunicationHistoryEntry;
}

export const CommunicationCard: React.FC<CommunicationCardProps> = ({ entry }) => (
    <div className='theia-card'>
        <div className='theia-card-meta'>
            <span className='theia-card-request-id'>Request ID: {entry.requestId}</span>
            <span className='theia-card-session-id'>Session ID: {entry.sessionId}</span>
        </div>
        <div className='theia-card-content'>
            {entry.request && (
                <div className='theia-card-request'>
                    <p><strong>Request</strong></p>
                    <pre>{entry.request}</pre>
                </div>
            )}
            {entry.response && (
                <div className='theia-card-response'>
                    <p><strong>Response</strong></p>
                    <pre>{entry.response}</pre>
                </div>
            )}
        </div>
        <div className='theia-card-meta'>
            <span className='theia-card-timestamp'>Timestamp: {new Date(entry.timestamp).toLocaleString()}</span>
            {entry.responseTime && <span className='theia-card-response-time'>Response Time: {entry.responseTime}ms</span>}
        </div>
    </div>
);
