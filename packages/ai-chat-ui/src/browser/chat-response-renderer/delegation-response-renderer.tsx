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
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatRequestInvocation, ChatResponseContent, ChatResponseModel, ToolCallChatResponseContent } from '@theia/ai-chat';
import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import * as React from '@theia/core/shared/react';
import { DelegationResponseContent, isDelegationResponseContent } from '@theia/ai-chat/lib/browser/delegation-response-content';
import { ResponseNode } from '../chat-tree-view';
import { CompositeTreeNode, ContextMenuRenderer } from '@theia/core/lib/browser';
import { SubChatWidgetFactory } from '../chat-tree-view/sub-chat-widget';
import { DisposableCollection, nls } from '@theia/core';
import { ToolInvocationRegistry } from '@theia/ai-core';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import { ToolConfirmationMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { ConfirmationScope, ToolConfirmation } from './tool-confirmation';

@injectable()
export class DelegationResponseRenderer implements ChatResponsePartRenderer<DelegationResponseContent> {

    @inject(SubChatWidgetFactory)
    subChatWidgetFactory: SubChatWidgetFactory;

    @inject(ContextMenuRenderer)
    contextMenuRenderer: ContextMenuRenderer;

    @inject(ToolConfirmationManager)
    toolConfirmationManager: ToolConfirmationManager;

    @inject(ToolInvocationRegistry)
    toolInvocationRegistry: ToolInvocationRegistry;

    canHandle(response: ChatResponseContent): number {
        if (isDelegationResponseContent(response)) {
            return 10;
        }
        return -1;
    }
    render(response: DelegationResponseContent, parentNode: ResponseNode): React.ReactNode {
        return this.renderExpandableNode(response, parentNode);
    }

    private renderExpandableNode(response: DelegationResponseContent, parentNode: ResponseNode): React.ReactNode {
        return <DelegatedChat
            response={response.response}
            agentId={response.agentId}
            prompt={response.prompt}
            parentNode={parentNode}
            subChatWidgetFactory={this.subChatWidgetFactory}
            contextMenuRenderer={this.contextMenuRenderer}
            toolConfirmationManager={this.toolConfirmationManager}
            toolInvocationRegistry={this.toolInvocationRegistry} />;
    }
}

interface DelegatedChatProps {
    response: ChatRequestInvocation;
    agentId: string;
    prompt: string;
    parentNode: ResponseNode;
    subChatWidgetFactory: SubChatWidgetFactory;
    contextMenuRenderer: ContextMenuRenderer;
    toolConfirmationManager: ToolConfirmationManager;
    toolInvocationRegistry: ToolInvocationRegistry;
}

interface PendingToolConfirmation {
    toolCall: ToolCallChatResponseContent;
    id: string;
}

interface DelegatedChatState {
    node?: ResponseNode;
    isOpen: boolean;
    pendingConfirmations: PendingToolConfirmation[];
}

class DelegatedChat extends React.Component<DelegatedChatProps, DelegatedChatState> {
    private widget: ReturnType<SubChatWidgetFactory>;
    private readonly toDispose = new DisposableCollection();
    private trackedToolCallIds = new Set<string>();

    constructor(props: DelegatedChatProps) {
        super(props);
        this.state = {
            node: undefined,
            isOpen: false,
            pendingConfirmations: []
        };
        this.widget = props.subChatWidgetFactory();
    }

    override componentDidMount(): void {
        // Start rendering as soon as the response is created (streaming mode)
        this.props.response.responseCreated.then(chatModel => {
            const node = mapResponseToNode(chatModel, this.props.parentNode);
            this.setState({ node });

            // Listen for changes to update the rendering as the response streams in
            const changeListener = () => {
                // Update pending confirmations when response content changes
                this.updatePendingConfirmations();
                // Force re-render when the response content changes
                this.forceUpdate();
            };
            this.toDispose.push(chatModel.onDidChange(changeListener));

            // Initial scan for pending confirmations
            this.updatePendingConfirmations();
        }).catch(error => {
            console.error('Failed to create delegated chat response:', error);
            // Still try to handle completion in case of partial success
        });

        // Keep the completion handling for final cleanup if needed
        this.props.response.responseCompleted.then(() => {
            // Final update when response is complete
            this.forceUpdate();
        }).catch(error => {
            console.error('Error in delegated chat response completion:', error);
            // Force update anyway to show any partial content or error state
            this.forceUpdate();
        });
    }

    override componentWillUnmount(): void {
        this.toDispose.dispose();
    }

    private updatePendingConfirmations(): void {
        if (!this.state.node) {
            return;
        }

        const content = this.state.node.response.response.content;
        const toolCalls = content.filter((c): c is ToolCallChatResponseContent =>
            ToolCallChatResponseContent.is(c) && !c.finished && c.id !== undefined
        );

        // Track new tool calls and subscribe to their confirmation promises
        for (const toolCall of toolCalls) {
            const toolCallId = toolCall.id!;
            if (!this.trackedToolCallIds.has(toolCallId)) {
                this.trackedToolCallIds.add(toolCallId);

                // Check confirmation mode - if auto-allowed or disabled, don't show in summary
                const confirmationMode = this.getToolConfirmationMode(toolCall);
                if (confirmationMode === ToolConfirmationMode.ALWAYS_ALLOW ||
                    confirmationMode === ToolConfirmationMode.DISABLED) {
                    continue;
                }

                // Add to pending confirmations
                this.setState(prevState => ({
                    pendingConfirmations: [
                        ...prevState.pendingConfirmations,
                        { toolCall, id: toolCallId }
                    ]
                }));

                // Subscribe to confirmation promise to remove when resolved
                toolCall.confirmed
                    .then(() => this.removeFromPending(toolCallId))
                    .catch(() => this.removeFromPending(toolCallId));
            }
        }
    }

    private removeFromPending(toolCallId: string): void {
        this.setState(prevState => ({
            pendingConfirmations: prevState.pendingConfirmations.filter(p => p.id !== toolCallId)
        }));
    }

    private getToolConfirmationMode(toolCall: ToolCallChatResponseContent): ToolConfirmationMode {
        if (!toolCall.name) {
            return ToolConfirmationMode.CONFIRM;
        }
        const chatId = this.props.parentNode.sessionId;
        const toolRequest = this.props.toolInvocationRegistry.getFunction(toolCall.name);
        return this.props.toolConfirmationManager.getConfirmationMode(toolCall.name, chatId, toolRequest);
    }

    private handleToggle = (event: React.SyntheticEvent<HTMLDetailsElement>): void => {
        const details = event.currentTarget;
        this.setState({ isOpen: details.open });
    };

    private handleAllow = (toolCall: ToolCallChatResponseContent) => (scope: ConfirmationScope = 'once'): void => {
        const chatId = this.props.parentNode.sessionId;
        const toolRequest = toolCall.name ? this.props.toolInvocationRegistry.getFunction(toolCall.name) : undefined;

        if (scope === 'forever' && toolCall.name) {
            this.props.toolConfirmationManager.setConfirmationMode(toolCall.name, ToolConfirmationMode.ALWAYS_ALLOW, toolRequest);
        } else if (scope === 'session' && toolCall.name) {
            this.props.toolConfirmationManager.setSessionConfirmationMode(toolCall.name, ToolConfirmationMode.ALWAYS_ALLOW, chatId);
        }
        toolCall.confirm();
    };

    private handleDeny = (toolCall: ToolCallChatResponseContent) => (scope: ConfirmationScope = 'once', reason?: string): void => {
        const chatId = this.props.parentNode.sessionId;

        if (scope === 'forever' && toolCall.name) {
            this.props.toolConfirmationManager.setConfirmationMode(toolCall.name, ToolConfirmationMode.DISABLED);
        } else if (scope === 'session' && toolCall.name) {
            this.props.toolConfirmationManager.setSessionConfirmationMode(toolCall.name, ToolConfirmationMode.DISABLED, chatId);
        }
        toolCall.deny(reason);
    };

    override render(): React.ReactNode {
        const { agentId, prompt } = this.props;
        const hasNode = !!this.state.node;
        const isComplete = this.state.node?.response.isComplete ?? false;
        const isCanceled = this.state.node?.response.isCanceled ?? false;
        const isError = this.state.node?.response.isError ?? false;

        let statusIcon = '';
        let statusText = '';
        if (hasNode) {
            if (isCanceled) {
                statusIcon = 'codicon-close';
                statusText = nls.localize('theia/ai/chat-ui/delegation-response-renderer/status/canceled', 'canceled');
            } else if (isComplete) {
                statusIcon = 'codicon-check';
                statusText = nls.localizeByDefault('completed');
            } else if (isError) {
                statusIcon = 'codicon-error';
                statusText = nls.localize('theia/ai/chat-ui/delegation-response-renderer/status/error', 'error');
            } else {
                statusIcon = 'codicon-loading';
                statusText = nls.localize('theia/ai/chat-ui/delegation-response-renderer/status/generating', 'generating...');
            }
        } else {
            statusIcon = 'codicon-loading';
            statusText = nls.localize('theia/ai/chat-ui/delegation-response-renderer/status/starting', 'starting...');
        }

        const { isOpen, pendingConfirmations } = this.state;
        const showConfirmationsInSummary = !isOpen && pendingConfirmations.length > 0;

        return (
            <div className="theia-delegation-container">
                <details className="delegation-response-details" onToggle={this.handleToggle}>
                    <summary className="delegation-summary">
                        <div className="delegation-header">
                            <span className="delegation-agent">
                                <span className="codicon codicon-copilot-large" /> {agentId}
                            </span>
                            <span className="delegation-status">
                                <span className={`codicon ${statusIcon} delegation-status-icon`}></span>
                                <span className="delegation-status-text">{statusText}</span>
                            </span>
                        </div>
                        {showConfirmationsInSummary && (
                            <div className="delegation-pending-confirmations">
                                {pendingConfirmations.map(({ toolCall, id }) => {
                                    const toolRequest = toolCall.name
                                        ? this.props.toolInvocationRegistry.getFunction(toolCall.name)
                                        : undefined;
                                    return (
                                        <ToolConfirmation
                                            key={id}
                                            response={toolCall}
                                            toolRequest={toolRequest}
                                            onAllow={this.handleAllow(toolCall)}
                                            onDeny={this.handleDeny(toolCall)}
                                            contextMenuRenderer={this.props.contextMenuRenderer}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </summary>
                    <div className="delegation-content">
                        <div className="delegation-prompt-section">
                            <strong>{nls.localize('theia/ai/chat-ui/delegation-response-renderer/prompt/label', 'Delegated prompt:')}</strong>
                            <div className="delegation-prompt">{prompt}</div>
                        </div>
                        <div className="delegation-response-section">
                            <strong>{nls.localize('theia/ai/chat-ui/delegation-response-renderer/response/label', 'Response:')}</strong>
                            <div className='delegation-response-placeholder'>
                                {hasNode && this.state.node ? this.widget.renderChatResponse(this.state.node) :
                                    <div className="theia-ChatContentInProgress">
                                        {nls.localize('theia/ai/chat-ui/delegation-response-renderer/starting', 'Starting delegation...')}
                                    </div>
                                }
                            </div>
                        </div>
                    </div>
                </details>
            </div>
        );
    }
}

function mapResponseToNode(response: ChatResponseModel, parentNode: ResponseNode): ResponseNode {
    return {
        id: response.id,
        parent: parentNode as unknown as CompositeTreeNode,
        response,
        sessionId: parentNode.sessionId
    };
}
