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

    constructor(props: DelegatedChatProps) {
        super(props);
        this.state = {
            node: undefined
        };
        this.widget = props.subChatWidgetFactory();
    }

    override componentDidMount(): void {
        this.props.response.responseCompleted.then(chatModel => {
            this.setState({ node: mapResponseToNode(chatModel, this.props.parentNode) });
        });
    }

    override render(): React.ReactNode {
        const { agentId, prompt } = this.props;
        return (
            <div className="theia-toolCall">
                <details className="delegation-response-details">
                    <summary>
                        <strong>Agent:</strong> {agentId}
                    </summary>
                    <div>
                        <div><strong>Delegated prompt:</strong> {prompt}</div>
                        <div className='delegation-response-placeholder'>
                            {this.state.node && this.widget.renderChatResponse(this.state.node)}
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
        response
    };
}
