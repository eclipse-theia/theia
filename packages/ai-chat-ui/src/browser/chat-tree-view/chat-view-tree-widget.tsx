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

import {
    ChatModel,
    ChatRequestModel,
    ChatResponseModel,
} from '@theia/ai-chat';
import {
    codicon,
    CompositeTreeNode,
    ContextMenuRenderer,
    NodeProps,
    TreeModel,
    TreeNode,
    TreeProps,
    TreeWidget,
} from '@theia/core/lib/browser';
import {
    inject,
    injectable,
    postConstruct,
} from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

// TODO Instead of directly operating on the ChatRequestModel we could use an intermediate view model
interface RequestNode extends TreeNode {
    request: ChatRequestModel
}
const isRequestNode = (node: TreeNode): node is RequestNode => 'request' in node;

// TODO Instead of directly operating on the ChatResponseModel we could use an intermediate view model
interface ResponseNode extends TreeNode {
    response: ChatResponseModel
}
const isResponseNode = (node: TreeNode): node is ResponseNode => 'response' in node;

@injectable()
export class ChatViewTreeWidget extends TreeWidget {
    static readonly ID = 'chat-tree-widget';

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(TreeModel) model: TreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);

        this.id = ChatViewTreeWidget.ID;
        this.title.closable = false;

        model.root = {
            id: 'ChatTree',
            name: 'ChatRootNode',
            parent: undefined,
            visible: false,
            children: [],
        } as CompositeTreeNode;
    }

    @postConstruct()
    protected override init(): void {
        super.init();

        this.id = ChatViewTreeWidget.ID + '-treeContainer';
        this.addClass('treeContainer');
    }

    private mapRequestToNode(request: ChatRequestModel): RequestNode {
        return {
            id: request.id,
            parent: this.model.root as CompositeTreeNode,
            request
        };
    }

    private mapResponseToNode(response: ChatResponseModel): ResponseNode {
        return {
            id: response.id,
            parent: this.model.root as CompositeTreeNode,
            response
        };
    }

    /**
     * Tracks the handed over ChatModel.
     * Tracking multiple chat models will result in a weird UI
     */
    public trackChatModel(chatModel: ChatModel): void {
        this.recreateModelTree(chatModel);
        chatModel.getRequests().forEach(request => {
            if (!request.response.isComplete) {
                request.response.onDidChange(() => this.update());
            }
        });
        chatModel.onDidChange(event => {
            if (event.kind === 'addRequest') {
                this.recreateModelTree(chatModel);
                if (!event.request.response.isComplete) {
                    event.request.response.onDidChange(() => this.update());
                }
            }
        });
    }

    private async recreateModelTree(chatModel: ChatModel): Promise<void> {
        if (CompositeTreeNode.is(this.model.root)) {
            const nodes: TreeNode[] = [];
            chatModel.getRequests().forEach(request => {
                nodes.push(this.mapRequestToNode(request));
                nodes.push(this.mapResponseToNode(request.response));
            });
            this.model.root.children = nodes;
            this.model.refresh();
        }
    }

    protected override renderNode(
        node: TreeNode,
        props: NodeProps
    ): React.ReactNode {
        if (!TreeNode.isVisible(node)) {
            return undefined;
        }

        if (isRequestNode(node)) {
            return this.renderChatRequestPart(node);
        }
        if (isResponseNode(node)) {
            return this.renderTextChatPart(node);
        }

        return super.renderNode(node, props);
    }

    private renderChatRequestPart(node: RequestNode): React.ReactNode {
        return (
            <React.Fragment key={node.id}>
                <div>
                    <label className={codicon('account')}></label>
                </div>
                <div className={'theia-TextChatPartNode'}>{node.request.request.text}</div>
            </React.Fragment>
        );
    }
    // TODO Delegate to a registry of ChatResponseCOntent renderers
    private renderTextChatPart(node: ResponseNode): React.ReactNode {
        return (
            <React.Fragment key={node.id}>
                <div>
                    <label className={codicon('copilot')}></label>
                </div>
                <div className={'theia-TextChatPartNode'}>{node.response.response.asString()}</div>
            </React.Fragment>
        );
    }
}
