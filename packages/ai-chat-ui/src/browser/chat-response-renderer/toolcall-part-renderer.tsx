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

import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatResponseContent, ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';
import { codicon, ContextMenuRenderer, HoverService, OpenerService } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { ToolConfirmation, ToolConfirmationState } from './tool-confirmation';
import { ToolConfirmationMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { ResponseNode } from '../chat-tree-view';
import { useMarkdownRendering } from './markdown-part-renderer';
import { ToolCallResult, ToolInvocationRegistry, ToolRequest } from '@theia/ai-core';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { condenseArguments } from './toolcall-utils';

@injectable()
export class ToolCallPartRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(ToolConfirmationManager)
    protected toolConfirmationManager: ToolConfirmationManager;

    @inject(OpenerService)
    protected openerService: OpenerService;

    @inject(ToolInvocationRegistry)
    protected toolInvocationRegistry: ToolInvocationRegistry;

    @inject(HoverService)
    protected hoverService: HoverService;

    @inject(ContextMenuRenderer)
    protected contextMenuRenderer: ContextMenuRenderer;

    canHandle(response: ChatResponseContent): number {
        if (ToolCallChatResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        const chatId = parentNode.sessionId;
        const toolRequest = response.name ? this.toolInvocationRegistry.getFunction(response.name) : undefined;
        const confirmationMode = response.name ? this.getToolConfirmationSettings(response.name, chatId, toolRequest) : ToolConfirmationMode.DISABLED;
        return <ToolCallContent
            response={response}
            confirmationMode={confirmationMode}
            toolConfirmationManager={this.toolConfirmationManager}
            toolRequest={toolRequest}
            chatId={chatId}
            getArgumentsLabel={this.getArgumentsLabel.bind(this)}
            showArgsTooltip={this.showArgsTooltip.bind(this)}
            responseRenderer={this.renderResult.bind(this)}
            requestCanceled={parentNode.response.isCanceled}
            contextMenuRenderer={this.contextMenuRenderer} />;
    }

    protected renderResult(response: ToolCallChatResponseContent): ReactNode {
        const result = this.tryParse(response.result);
        if (!result) {
            return undefined;
        }
        if (typeof result === 'string') {
            return <pre>{JSON.stringify(result, undefined, 2)}</pre>;
        }
        if ('content' in result) {
            return <div className='theia-toolCall-response-content'>
                {result.content.map((content, idx) => {
                    switch (content.type) {
                        case 'image': {
                            return <div key={`content-${idx}-${content.type}`} className='theia-toolCall-image-result'>
                                <img src={`data:${content.mimeType};base64,${content.base64data}`} />
                            </div>;
                        }
                        case 'text': {
                            return <div key={`content-${idx}-${content.type}`} className='theia-toolCall-text-result'>
                                <MarkdownRender text={content.text} openerService={this.openerService} />
                            </div>;
                        }
                        case 'audio':
                        case 'error':
                        default: {
                            return <div key={`content-${idx}-${content.type}`} className='theia-toolCall-default-result'><pre>{JSON.stringify(response, undefined, 2)}</pre></div>;
                        }
                    }
                })}
            </div>;
        }
        return <pre>{JSON.stringify(result, undefined, 2)}</pre>;
    }

    private tryParse(result: ToolCallResult): ToolCallResult {
        if (!result) {
            return undefined;
        }
        try {
            return typeof result === 'string' ? JSON.parse(result) : result;
        } catch (error) {
            return result;
        }
    }

    protected getToolConfirmationSettings(responseId: string, chatId: string, toolRequest?: ToolRequest): ToolConfirmationMode {
        return this.toolConfirmationManager.getConfirmationMode(responseId, chatId, toolRequest);
    }

    protected getArgumentsLabel(toolName: string | undefined, args: string | undefined): string {
        if (!args || !args.trim() || args.trim() === '{}') {
            return '';
        }
        try {
            const toolRequest = toolName ? this.toolInvocationRegistry.getFunction(toolName) : undefined;
            if (toolRequest?.getArgumentsShortLabel) {
                const result = toolRequest.getArgumentsShortLabel(args);
                if (result) {
                    return result.hasMore ? `${result.label} \u2026` : result.label;
                }
            }
        } catch {
            // tool not found in registry, fall through to generic condensed rendering
        }
        return condenseArguments(args) ?? '\u2026';
    }

    protected showArgsTooltip(response: ToolCallChatResponseContent, target: HTMLElement | undefined): void {
        if (!target || !response.arguments || !response.arguments.trim() || response.arguments.trim() === '{}') {
            return;
        }
        const prettyArgs = this.prettyPrintArgs(response.arguments);
        const markdownString = new MarkdownStringImpl(`**${response.name}**\n`).appendCodeblock('json', prettyArgs);
        this.hoverService.requestHover({
            content: markdownString,
            target,
            position: 'right'
        });
    }

    private prettyPrintArgs(args: string): string {
        try {
            return JSON.stringify(JSON.parse(args), undefined, 2);
        } catch (e) {
            // fall through
            return args;
        }
    }
}

const Spinner = () => (
    <span className={`${codicon('loading')} theia-animation-spin`}></span>
);

interface ToolCallContentProps {
    response: ToolCallChatResponseContent;
    confirmationMode: ToolConfirmationMode;
    toolConfirmationManager: ToolConfirmationManager;
    toolRequest?: ToolRequest;
    chatId: string;
    getArgumentsLabel: (toolName: string | undefined, args: string | undefined) => string;
    showArgsTooltip: (response: ToolCallChatResponseContent, target: HTMLElement | undefined) => void;
    responseRenderer: (response: ToolCallChatResponseContent) => ReactNode | undefined;
    requestCanceled: boolean;
    contextMenuRenderer: ContextMenuRenderer;
}

/**
 * A function component to handle tool call rendering and confirmation
 */
const ToolCallContent: React.FC<ToolCallContentProps> = ({
    response,
    confirmationMode,
    toolConfirmationManager,
    toolRequest,
    chatId,
    responseRenderer,
    getArgumentsLabel,
    requestCanceled,
    showArgsTooltip,
    contextMenuRenderer
}) => {
    const [confirmationState, setConfirmationState] = React.useState<ToolConfirmationState>('waiting');
    const [rejectionReason, setRejectionReason] = React.useState<unknown>(undefined);
    // eslint-disable-next-line no-null/no-null
    const summaryRef = React.useRef<HTMLElement>(null);

    const formatReason = (reason: unknown): string => {
        if (!reason) {
            return '';
        }
        if (reason instanceof Error) {
            return reason.message;
        }
        if (typeof reason === 'string') {
            return reason;
        }
        try {
            return JSON.stringify(reason);
        } catch (e) {
            return String(reason);
        }
    };

    React.useEffect(() => {
        if (confirmationMode === ToolConfirmationMode.ALWAYS_ALLOW) {
            response.confirm();
            setConfirmationState('allowed');
            return;
        } else if (confirmationMode === ToolConfirmationMode.DISABLED) {
            response.deny();
            setConfirmationState('denied');
            return;
        }
        response.confirmed
            .then(confirmed => {
                if (confirmed === true) {
                    setConfirmationState('allowed');
                } else {
                    setConfirmationState('denied');
                }
            })
            .catch(reason => {
                setRejectionReason(reason);
                setConfirmationState('rejected');
            });
    }, [response, confirmationMode]);

    const handleAllow = React.useCallback((mode: 'once' | 'session' | 'forever' = 'once') => {
        if (mode === 'forever' && response.name) {
            toolConfirmationManager.setConfirmationMode(response.name, ToolConfirmationMode.ALWAYS_ALLOW, toolRequest);
        } else if (mode === 'session' && response.name) {
            toolConfirmationManager.setSessionConfirmationMode(response.name, ToolConfirmationMode.ALWAYS_ALLOW, chatId);
        }
        response.confirm();
    }, [response, toolConfirmationManager, chatId, toolRequest]);

    const handleDeny = React.useCallback((mode: 'once' | 'session' | 'forever' = 'once', reason?: string) => {
        if (mode === 'forever' && response.name) {
            toolConfirmationManager.setConfirmationMode(response.name, ToolConfirmationMode.DISABLED);
        } else if (mode === 'session' && response.name) {
            toolConfirmationManager.setSessionConfirmationMode(response.name, ToolConfirmationMode.DISABLED, chatId);
        }
        response.deny(reason);
    }, [response, toolConfirmationManager, chatId]);

    const reasonText = formatReason(rejectionReason);

    return (
        <div className='theia-toolCall'>
            {confirmationState === 'rejected' ? (
                <span className='theia-toolCall-rejected'>
                    <span className={codicon('error')}></span> {nls.localize('theia/ai/chat-ui/toolcall-part-renderer/rejected', 'Execution canceled')}: {response.name}
                    {reasonText ? <span> — {reasonText}</span> : undefined}
                </span>
            ) : requestCanceled && !response.finished ? (
                <span className='theia-toolCall-rejected'>
                    <span className={codicon('error')}></span> {nls.localize('theia/ai/chat-ui/toolcall-part-renderer/rejected', 'Execution canceled')}: {response.name}
                </span>
            ) : confirmationState === 'denied' ? (
                <span className='theia-toolCall-denied'>
                    <span className={codicon('error')}></span> {nls.localize('theia/ai/chat-ui/toolcall-part-renderer/denied', 'Execution denied')}: {response.name}
                </span>
            ) : response.finished ? (
                <details className='theia-toolCall-finished'>
                    <summary
                        ref={summaryRef}
                        onMouseEnter={() => showArgsTooltip(response, summaryRef.current ?? undefined)}
                    >
                        {nls.localize('theia/ai/chat-ui/toolcall-part-renderer/finished', 'Ran')} {response.name}
                        (<span className='theia-toolCall-args-label'>{getArgumentsLabel(response.name, response.arguments)}</span>)
                    </summary>
                    <div className='theia-toolCall-response-result'>
                        {responseRenderer(response)}
                    </div>
                </details>
            ) : (
                confirmationState === 'allowed' && !requestCanceled && (
                    <span className='theia-toolCall-allowed'>
                        <Spinner /> {nls.localizeByDefault('Running')} {response.name}
                    </span>
                )
            )}

            {confirmationState === 'waiting' && !requestCanceled && !response.finished && (
                <span className='theia-toolCall-waiting'>
                    <ToolConfirmation
                        response={response}
                        toolRequest={toolRequest}
                        onAllow={handleAllow}
                        onDeny={handleDeny}
                        contextMenuRenderer={contextMenuRenderer}
                    />
                </span>
            )}
        </div>
    );
};

const MarkdownRender = ({ text, openerService }: { text: string; openerService: OpenerService }) => {
    const ref = useMarkdownRendering(text, openerService);
    return <div ref={ref}></div>;
};
