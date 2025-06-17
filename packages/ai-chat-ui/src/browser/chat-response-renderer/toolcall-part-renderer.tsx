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
import { codicon, OpenerService } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { ToolConfirmation, ToolConfirmationState } from './tool-confirmation';
import { ToolConfirmationManager, ToolConfirmationMode } from '@theia/ai-chat/lib/browser/chat-tool-preferences';
import { ResponseNode } from '../chat-tree-view';
import { useMarkdownRendering } from './markdown-part-renderer';
import { ToolCallResult } from '@theia/ai-core';

@injectable()
export class ToolCallPartRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(ToolConfirmationManager)
    protected toolConfirmationManager: ToolConfirmationManager;

    @inject(OpenerService)
    protected openerService: OpenerService;

    canHandle(response: ChatResponseContent): number {
        if (ToolCallChatResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        const chatId = parentNode.sessionId;
        const confirmationMode = response.name ? this.getToolConfirmationSettings(response.name, chatId) : ToolConfirmationMode.DISABLED;
        return <ToolCallContent
            response={response}
            confirmationMode={confirmationMode}
            toolConfirmationManager={this.toolConfirmationManager}
            chatId={chatId}
            renderCollapsibleArguments={this.renderCollapsibleArguments.bind(this)}
            responseRenderer={this.renderResult.bind(this)} />;
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

    protected getToolConfirmationSettings(responseId: string, chatId: string): ToolConfirmationMode {
        return this.toolConfirmationManager.getConfirmationMode(responseId, chatId);
    }

    protected renderCollapsibleArguments(args: string | undefined): ReactNode {
        if (!args || !args.trim() || args.trim() === '{}') {
            return undefined;
        }

        return (
            <details className="collapsible-arguments">
                <summary className="collapsible-arguments-summary">...</summary>
                <span>{this.prettyPrintArgs(args)}</span>
            </details>
        );
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
    chatId: string;
    renderCollapsibleArguments: (args: string | undefined) => ReactNode;
    responseRenderer: (response: ToolCallChatResponseContent) => ReactNode | undefined;
}

/**
 * A function component to handle tool call rendering and confirmation
 */
const ToolCallContent: React.FC<ToolCallContentProps> = ({ response, confirmationMode, toolConfirmationManager, chatId, responseRenderer, renderCollapsibleArguments }) => {
    const [confirmationState, setConfirmationState] = React.useState<ToolConfirmationState>('waiting');

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
        response.confirmed.then(
            confirmed => {
                if (confirmed === true) {
                    setConfirmationState('allowed');
                } else {
                    setConfirmationState('denied');
                }
            }
        )
            .catch(() => {
                setConfirmationState('denied');
            });
    }, [response, confirmationMode]);

    const handleAllow = React.useCallback((mode: 'once' | 'session' | 'forever' = 'once') => {
        if (mode === 'forever' && response.name) {
            toolConfirmationManager.setConfirmationMode(response.name, ToolConfirmationMode.ALWAYS_ALLOW);
        } else if (mode === 'session' && response.name) {
            toolConfirmationManager.setSessionConfirmationMode(response.name, ToolConfirmationMode.ALWAYS_ALLOW, chatId);
        }
        response.confirm();
    }, [response, toolConfirmationManager, chatId]);

    const handleDeny = React.useCallback((mode: 'once' | 'session' | 'forever' = 'once') => {
        if (mode === 'forever' && response.name) {
            toolConfirmationManager.setConfirmationMode(response.name, ToolConfirmationMode.DISABLED);
        } else if (mode === 'session' && response.name) {
            toolConfirmationManager.setSessionConfirmationMode(response.name, ToolConfirmationMode.DISABLED, chatId);
        }
        response.deny();
    }, [response, toolConfirmationManager, chatId]);

    return (
        <div className='theia-toolCall'>
            {confirmationState === 'denied' ? (
                <span className='theia-toolCall-denied'>
                    <span className={codicon('error')}></span> {nls.localize('theia/ai/chat-ui/toolcall-part-renderer/denied', 'Execution denied')}: {response.name}
                </span>
            ) : response.finished ? (
                <details className='theia-toolCall-finished'>
                    <summary>
                        {nls.localize('theia/ai/chat-ui/toolcall-part-renderer/finished', 'Ran')} {response.name}
                        ({renderCollapsibleArguments(response.arguments)})
                    </summary>
                    <div className='theia-toolCall-response-result'>
                        {responseRenderer(response)}
                    </div>
                </details>
            ) : (
                confirmationState === 'allowed' && (
                    <span className='theia-toolCall-allowed'>
                        <Spinner /> {nls.localizeByDefault('Running')} {response.name}
                    </span>
                )
            )}

            {/* Show confirmation UI when waiting for allow */}
            {confirmationState === 'waiting' && (
                <span className='theia-toolCall-waiting'>
                    <ToolConfirmation
                        response={response}
                        onAllow={handleAllow}
                        onDeny={handleDeny}
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
