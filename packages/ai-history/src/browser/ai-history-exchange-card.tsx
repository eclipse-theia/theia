// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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
    LanguageModelExchangeRequest,
    LanguageModelExchange,
    LanguageModelMonitoredStreamResponse,
    LanguageModelExchangeRequestResponse
} from '@theia/ai-core/lib/common/language-model-interaction-model';
import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';

const getTextFromResponse = (response: LanguageModelExchangeRequestResponse): string => {
    // Handle monitored stream response
    if ('parts' in response) {
        let result = '';
        for (const chunk of response.parts) {
            if ('content' in chunk && chunk.content) {
                result += chunk.content;
            }
        }
        return result;
    }

    // Handle text response
    if ('text' in response) {
        return response.text;
    }

    // Handle parsed response
    if ('content' in response) {
        return response.content;
    }

    return JSON.stringify(response);
};

const renderTextWithNewlines = (text: string): React.ReactNode => text.split(/\\n|\n/).map((line, i) => (
    <React.Fragment key={i}>
        {i > 0 && <br />}
        {line}
    </React.Fragment>
));

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

export interface ExchangeCardProps {
    exchange: LanguageModelExchange;
    selectedAgentId?: string;
    compactView?: boolean;
    renderNewlines?: boolean;
}

export const ExchangeCard: React.FC<ExchangeCardProps> = ({ exchange, selectedAgentId, compactView = true, renderNewlines = false }) => {

    const earliestTimestamp = exchange.requests.reduce((earliest, req) => {
        const timestamp = req.metadata.timestamp as number || 0;
        return timestamp && (!earliest || timestamp < earliest) ? timestamp : earliest;
    }, 0);

    return (
        <div className="theia-card exchange-card"
            role="article"
            aria-label={`Exchange ${exchange.id}`}>
            <div className='theia-card-meta'>
                <span className='theia-card-request-id'>
                    {nls.localizeByDefault('ID')}: {exchange.id}
                </span>
                {exchange.metadata.agent && (
                    <span className='theia-card-agent-id'>
                        {nls.localize('theia/ai/history/exchange-card/agentId', 'Agent')}: {exchange.metadata.agent}
                    </span>
                )}
            </div>
            <div className='theia-card-content'>
                <div className='requests-container'>
                    {exchange.requests.map((request, index) => (
                        <RequestCard
                            key={request.id}
                            request={request}
                            index={index}
                            totalRequests={exchange.requests.length}
                            selectedAgentId={selectedAgentId}
                            compactView={compactView}
                            renderNewlines={renderNewlines}
                        />
                    ))}
                </div>
            </div>
            <div className='theia-card-meta'>
                {earliestTimestamp > 0 && (
                    <span className='theia-card-timestamp'>
                        {nls.localize('theia/ai/history/exchange-card/timestamp', 'Started')}: {formatTimestamp(earliestTimestamp)}
                    </span>
                )}
            </div>
        </div>
    );
};

interface RequestCardProps {
    request: LanguageModelExchangeRequest;
    index: number;
    totalRequests: number;
    selectedAgentId?: string;
    compactView?: boolean;
    renderNewlines?: boolean;
}

const RequestCard: React.FC<RequestCardProps> = ({ request, index, totalRequests, selectedAgentId, compactView = true, renderNewlines = false }) => {
    const isFromDifferentAgent = selectedAgentId &&
        request.metadata.agent &&
        request.metadata.agent !== selectedAgentId;

    const isStreamResponse = 'parts' in request.response;

    const getRequestContent = () => {
        if (compactView) {
            const content = formatJson(request.request.messages);
            return (
                <div className="compact-response">
                    <pre className={`formatted-json ${renderNewlines ? 'render-newlines' : ''}`}>
                        {renderNewlines ? renderTextWithNewlines(content) : content}
                    </pre>
                </div>
            );
        } else {
            const content = formatJson(request.request);
            return (
                <pre className={`formatted-json ${renderNewlines ? 'render-newlines' : ''}`}>
                    {renderNewlines ? renderTextWithNewlines(content) : content}
                </pre>
            );
        }
    };

    const getResponseContent = () => {
        if (compactView) {
            const content = getTextFromResponse(request.response);
            return (
                <div className="compact-response">
                    <pre className={`formatted-json ${renderNewlines ? 'render-newlines' : ''}`}>
                        {renderNewlines ? renderTextWithNewlines(content) : content}
                    </pre>
                </div>
            );
        } else if (isStreamResponse) {
            const streamResponse = request.response as LanguageModelMonitoredStreamResponse;
            return streamResponse.parts.map((part, i) => (
                <div key={`part-${i}`} className="stream-part">
                    <pre className={`formatted-json ${renderNewlines ? 'render-newlines' : ''}`}>
                        {renderNewlines ? renderTextWithNewlines(JSON.stringify(part, undefined, 2)) : JSON.stringify(part, undefined, 2)}
                    </pre>
                </div>
            ));
        } else {
            const content = formatJson(request.response);
            return (
                <pre className={`formatted-json ${renderNewlines ? 'render-newlines' : ''}`}>
                    {renderNewlines ? renderTextWithNewlines(content) : content}
                </pre>
            );
        }
    };

    return (
        <div className={`request-card ${isFromDifferentAgent ? 'different-agent-opacity' : ''}`}>
            <div className='request-header'>
                {totalRequests > 1 && (
                    <h3>{nls.localize('theia/ai/history/request-card/title', 'Request')} {index + 1}</h3>
                )}
                <div className='request-info'>
                    <span className='request-id'>ID: {request.id}</span>
                    {request.metadata.agent && (
                        <span className={`request-agent ${isFromDifferentAgent ? 'different-agent-name' : ''}`}>
                            {nls.localize('theia/ai/history/request-card/agent', 'Agent')}: {request.metadata.agent}
                        </span>
                    )}
                    <span className='request-model'>
                        {nls.localize('theia/ai/history/request-card/model', 'Model')}: {request.languageModel}
                    </span>
                    {!!request.metadata.promptVariantId && (
                        <span className={`request-prompt-variant ${request.metadata.isPromptVariantCustomized ? 'customized' : ''}`}>
                            {!!request.metadata.isPromptVariantCustomized && (
                                <span className='customized-prefix'>
                                    [{nls.localize('theia/ai/history/edited', 'edited')}]{' '}
                                </span>
                            )}
                            {nls.localize('theia/ai/history/request-card/promptVariant', 'Prompt Variant')}: {request.metadata.promptVariantId as string}
                        </span>
                    )}
                </div>
            </div>

            <div className='request-content-container'>
                <details>
                    <summary>
                        {nls.localize('theia/ai/history/request-card/request', 'Request')}
                    </summary>
                    <div className='request-content'>
                        {getRequestContent()}
                    </div>
                </details>

                <details>
                    <summary>
                        {nls.localize('theia/ai/history/request-card/response', 'Response')}
                    </summary>
                    <div className='response-content'>
                        {getResponseContent()}
                    </div>
                </details>
            </div>

            <div className='request-meta'>
                {request.metadata.timestamp && (
                    <span className='request-timestamp'>
                        {nls.localize('theia/ai/history/request-card/timestamp', 'Timestamp')}: {formatTimestamp(request.metadata.timestamp as number)}
                    </span>
                )}
            </div>
        </div>
    );
};
