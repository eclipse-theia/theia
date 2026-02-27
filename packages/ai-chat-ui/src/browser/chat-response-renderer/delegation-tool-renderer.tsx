// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { AGENT_DELEGATION_FUNCTION_ID } from '@theia/ai-core/lib/common/tool-constants';
import { AgentDelegationTool } from '@theia/ai-chat/lib/browser/agent-delegation-tool';
import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { ResponseNode } from '../chat-tree-view';
import { SubChatWidgetFactory } from '../chat-tree-view/sub-chat-widget';
import { CompositeTreeNode } from '@theia/core/lib/browser';
import { DisposableCollection, nls } from '@theia/core';
import * as React from '@theia/core/shared/react';

@injectable()
export class DelegationToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(AgentDelegationTool)
    protected agentDelegationTool: AgentDelegationTool;

    @inject(SubChatWidgetFactory)
    protected subChatWidgetFactory: SubChatWidgetFactory;

    canHandle(response: ChatResponseContent): number {
        if (ToolCallChatResponseContent.is(response) && response.name === AGENT_DELEGATION_FUNCTION_ID) {
            return 20;
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): React.ReactNode {
        const delegation = response.id ? this.agentDelegationTool.getDelegation(response.id) : undefined;

        let agentId = response.name ?? AGENT_DELEGATION_FUNCTION_ID;
        let prompt = '';
        if (response.arguments) {
            try {
                const args = JSON.parse(response.arguments);
                if (typeof args.agentId === 'string') {
                    agentId = args.agentId;
                }
                if (typeof args.prompt === 'string') {
                    prompt = args.prompt;
                }
            } catch {
                // ignore parse errors
            }
        }

        return <DelegatedChat
            invocation={delegation?.invocation}
            agentId={delegation?.agentName ?? agentId}
            prompt={delegation?.prompt ?? prompt}
            finished={response.finished}
            parentNode={parentNode}
            subChatWidgetFactory={this.subChatWidgetFactory}
        />;
    }
}

// --- DelegatedChat component (ported from delegation-response-renderer.tsx) ---

interface DelegatedChatProps {
    invocation?: ChatRequestInvocation;
    agentId: string;
    prompt: string;
    finished?: boolean;
    parentNode: ResponseNode;
    subChatWidgetFactory: SubChatWidgetFactory;
}

interface DelegatedChatState {
    node?: ResponseNode;
}

class DelegatedChat extends React.Component<DelegatedChatProps, DelegatedChatState> {
    private widget: ReturnType<SubChatWidgetFactory>;
    private toDispose = new DisposableCollection();

    constructor(props: DelegatedChatProps) {
        super(props);
        this.state = { node: undefined };
        this.widget = props.subChatWidgetFactory();
    }

    override componentDidMount(): void {
        this.subscribeToInvocation(this.props.invocation);
    }

    override componentDidUpdate(prevProps: DelegatedChatProps): void {
        if (this.props.invocation && this.props.invocation !== prevProps.invocation) {
            this.subscribeToInvocation(this.props.invocation);
        }
    }

    private subscribeToInvocation(invocation?: ChatRequestInvocation): void {
        this.toDispose.dispose();
        this.toDispose = new DisposableCollection();
        if (!invocation) {
            return;
        }

        invocation.responseCreated.then(chatModel => {
            const node = mapResponseToNode(chatModel, this.props.parentNode);
            this.setState({ node });

            const changeListener = () => {
                this.forceUpdate();
            };
            this.toDispose.push(chatModel.onDidChange(changeListener));
        }).catch(error => {
            console.error('Failed to create delegated chat response:', error);
        });

        invocation.responseCompleted.then(() => {
            this.forceUpdate();
        }).catch(error => {
            console.error('Error in delegated chat response completion:', error);
            this.forceUpdate();
        });
    }

    override componentWillUnmount(): void {
        this.toDispose.dispose();
    }

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
        } else if (this.props.finished) {
            statusIcon = 'codicon-check';
            statusText = nls.localizeByDefault('completed');
        } else {
            statusIcon = 'codicon-loading';
            statusText = nls.localize('theia/ai/chat-ui/delegation-response-renderer/status/starting', 'starting...');
        }

        return (
            <div className='theia-delegation-container'>
                <details className='delegation-response-details'>
                    <summary className='delegation-summary'>
                        <div className='delegation-header'>
                            <span className='delegation-agent'>
                                <span className='codicon codicon-copilot-large' /> {agentId}
                            </span>
                            <span className='delegation-status'>
                                <span className={`codicon ${statusIcon} delegation-status-icon`}></span>
                                <span className='delegation-status-text'>{statusText}</span>
                            </span>
                        </div>
                    </summary>
                    <div className='delegation-content'>
                        <div className='delegation-prompt-section'>
                            <strong>{nls.localize('theia/ai/chat-ui/delegation-response-renderer/prompt/label', 'Delegated prompt:')}</strong>
                            <div className='delegation-prompt'>{prompt}</div>
                        </div>
                        <div className='delegation-response-section'>
                            <strong>{nls.localize('theia/ai/chat-ui/delegation-response-renderer/response/label', 'Response:')}</strong>
                            <div className='delegation-response-placeholder'>
                                {hasNode && this.state.node ? this.widget.renderChatResponse(this.state.node) :
                                    this.props.finished ?
                                        <span className='delegation-status-text'>
                                            {nls.localize('theia/ai/chat-ui/delegation-response-renderer/restoredNotAvailable',
                                                'Response not available for restored sessions.')}
                                        </span> :
                                        <div className='theia-ChatContentInProgress'>
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
