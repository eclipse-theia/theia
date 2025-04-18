// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { AiRequest, AiSemanticRequest, LanguageModelMonitoredStreamResponse } from '@theia/ai-core/lib/common/language-model-interaction-model';
import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';

export interface SemanticRequestCardProps {
    semanticRequest: AiSemanticRequest;
    selectedAgentId?: string;
}

export const SemanticRequestCard: React.FC<SemanticRequestCardProps> = ({ semanticRequest, selectedAgentId }) => {
    const formatTimestamp = (timestamp: number): string =>
        new Date(timestamp).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

    const isHighlighted = selectedAgentId && (
        semanticRequest.metadata.agent === selectedAgentId ||
        semanticRequest.requests.some(req => req.metadata.agent === selectedAgentId)
    );

    // Get the earliest timestamp from all sub-requests
    const earliestTimestamp = semanticRequest.requests.reduce((earliest, req) => {
        const timestamp = req.metadata.timestamp as number || 0;
        return timestamp && (!earliest || timestamp < earliest) ? timestamp : earliest;
    }, 0);

    return (
        <div className={`theia-card semantic-request-card ${isHighlighted ? 'highlighted' : ''}`}
            role="article"
            aria-label={`Semantic request ${semanticRequest.id}`}>
            <div className='theia-card-meta'>
                <span className='theia-card-request-id'>
                    {nls.localize('theia/ai/history/semantic-request-card/requestId', 'Request ID')}: {semanticRequest.id}
                </span>
                {semanticRequest.metadata.agent && (
                    <span className='theia-card-agent-id'>
                        {nls.localize('theia/ai/history/semantic-request-card/agentId', 'Agent')}: {semanticRequest.metadata.agent}
                    </span>
                )}
            </div>
            <div className='theia-card-content'>
                <h2>{nls.localize('theia/ai/history/semantic-request-card/semanticRequest', 'Semantic Request')}</h2>

                <div className='sub-requests-container'>
                    {semanticRequest.requests.map((request, index) => (
                        <SubRequestCard
                            key={request.id}
                            request={request}
                            index={index}
                            isHighlighted={selectedAgentId === request.metadata.agent}
                        />
                    ))}
                </div>
            </div>
            <div className='theia-card-meta'>
                {earliestTimestamp > 0 && (
                    <span className='theia-card-timestamp'>
                        {nls.localize('theia/ai/history/semantic-request-card/timestamp', 'Started')}: {formatTimestamp(earliestTimestamp)}
                    </span>
                )}
            </div>
        </div>
    );
};

interface SubRequestCardProps {
    request: AiRequest;
    index: number;
    isHighlighted: boolean;
}

const SubRequestCard: React.FC<SubRequestCardProps> = ({ request, index, isHighlighted }) => {
    const formatJson = (data: unknown): string => {
        try {
            return JSON.stringify(data, undefined, 2);
        } catch (error) {
            console.error('Error formatting JSON:', error);
            return 'Error formatting data';
        }
    };

    const formatTimestamp = (timestamp: number | undefined): string =>
        timestamp ? new Date(timestamp).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) : 'N/A';

    const isStreamResponse = 'parts' in request.response;

    const getResponseContent = () => {
        if (isStreamResponse) {
            const streamResponse = request.response as LanguageModelMonitoredStreamResponse;
            return streamResponse.parts.map((part, i) => (
                <div key={`part-${i}`} className="stream-part">
                    <pre>{JSON.stringify(part, undefined, 2)}</pre>
                </div>
            ));
        } else {
            return <pre>{formatJson(request.response)}</pre>;
        }
    };

    return (
        <div className={`sub-request-card ${isHighlighted ? 'highlighted' : ''}`}>
            <div className='sub-request-header'>
                <h3>{nls.localize('theia/ai/history/sub-request-card/title', 'Sub-Request')} {index + 1}</h3>
                <span className='sub-request-id'>ID: {request.id}</span>
                {request.metadata.agent && (
                    <span className='sub-request-agent'>
                        {nls.localize('theia/ai/history/sub-request-card/agent', 'Agent')}: {request.metadata.agent}
                    </span>
                )}
                <span className='sub-request-model'>
                    {nls.localize('theia/ai/history/sub-request-card/model', 'Model')}: {request.languageModel}
                </span>
            </div>

            <div className='sub-request-content'>
                <details>
                    <summary>
                        {nls.localize('theia/ai/history/sub-request-card/request', 'Request')}
                    </summary>
                    <div className='request-content'>
                        <pre>{formatJson(request.request)}</pre>
                    </div>
                </details>

                <details>
                    <summary>
                        {nls.localize('theia/ai/history/sub-request-card/response', 'Response')}
                    </summary>
                    <div className='response-content'>
                        {getResponseContent()}
                    </div>
                </details>
            </div>

            <div className='sub-request-meta'>
                {request.metadata.timestamp && (
                    <span className='sub-request-timestamp'>
                        {nls.localize('theia/ai/history/sub-request-card/timestamp', 'Timestamp')}: {formatTimestamp(request.metadata.timestamp as number)}
                    </span>
                )}
            </div>
        </div>
    );
};
