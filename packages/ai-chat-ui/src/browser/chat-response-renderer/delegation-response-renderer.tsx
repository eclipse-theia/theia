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
import { ChatRequestInvocation, ChatResponseContent, ChatResponseModel } from '@theia/ai-chat';
import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import * as React from '@theia/core/shared/react';
import { DelegationResponseContent, isDelegationResponseContent } from '@theia/ai-chat/lib/browser/delegation-response-content';
import { ResponseNode } from '../chat-tree-view';
import { CompositeTreeNode } from '@theia/core/lib/browser';
import { SubChatWidgetFactory } from '../chat-tree-view/sub-chat-widget';
import { DisposableCollection } from '@theia/core';

@injectable()
export class DelegationResponseRenderer implements ChatResponsePartRenderer<DelegationResponseContent> {

    @inject(SubChatWidgetFactory)
    subChatWidgetFactory: SubChatWidgetFactory;

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
            subChatWidgetFactory={this.subChatWidgetFactory} />;
    }
}

interface DelegatedChatProps {
    response: ChatRequestInvocation;
    agentId: string;
    prompt: string;
    parentNode: ResponseNode;
    subChatWidgetFactory: SubChatWidgetFactory;
}

interface DelegatedChatState {
    node?: ResponseNode;
}

class DelegatedChat extends React.Component<DelegatedChatProps, DelegatedChatState> {
    private widget: ReturnType<SubChatWidgetFactory>;
    private readonly toDispose = new DisposableCollection();

    constructor(props: DelegatedChatProps) {
        super(props);
        this.state = {
            node: undefined
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
                // Force re-render when the response content changes
                this.forceUpdate();
            };
            this.toDispose.push(chatModel.onDidChange(changeListener));
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

    override render(): React.ReactNode {
        const { agentId, prompt } = this.props;
        const hasNode = !!this.state.node;
        const isComplete = this.state.node?.response.isComplete ?? false;
        const isCanceled = this.state.node?.response.isCanceled ?? false;
        const isError = this.state.node?.response.isError ?? false;

        let statusIcon = '';
        let statusText = '';
        if (hasNode) {
            if (isComplete) {
                statusIcon = 'codicon-check';
                statusText = 'completed';
            } else if (isCanceled) {
                statusIcon = 'codicon-cancel';
                statusText = 'canceled';
            } else if (isError) {
                statusIcon = 'codicon-error';
                statusText = 'error';
            } else {
                statusIcon = 'codicon-loading';
                statusText = 'generating...';
            }
        } else {
            statusIcon = 'codicon-loading';
            statusText = 'starting...';
        }

        return (
            <div className="theia-delegation-container">
                <details className="delegation-response-details">
                    <summary className="delegation-summary">
                        <div className="delegation-header">
                            <span className="delegation-agent">
                                <strong>Agent:</strong> {agentId}
                            </span>
                            <span className="delegation-status">
                                <span className={`codicon ${statusIcon} delegation-status-icon`}></span>
                                <span className="delegation-status-text">{statusText}</span>
                            </span>
                        </div>
                    </summary>
                    <div className="delegation-content">
                        <div className="delegation-prompt-section">
                            <strong>Delegated prompt:</strong>
                            <div className="delegation-prompt">{prompt}</div>
                        </div>
                        <div className="delegation-response-section">
                            <strong>Response:</strong>
                            <div className='delegation-response-placeholder'>
                                {hasNode && this.state.node ? this.widget.renderChatResponse(this.state.node) :
                                    <div className="theia-ChatContentInProgress">Starting delegation...</div>
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
