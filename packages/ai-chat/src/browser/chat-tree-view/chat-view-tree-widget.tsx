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
    ChatRequestPart,
    ChatResponse,
    ChatResponsePart,
    TextChatResponsePart,
    TextStreamChatResponsePart,
    isTextChatResponsePart,
    isTextStreamChatResponsePart,
} from '@theia/ai-agent';
import { isChatRequestPart } from '@theia/ai-model-provider';
import {
    codicon,
    CompositeTreeNode,
    ContextMenuRenderer,
    NodeProps,
    SelectableTreeNode,
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
import { useEffect, useState } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';
import { v4 as uuid } from 'uuid';

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

    private fillPropertiesTree(
        items: (ChatRequestPart | ChatResponsePart)[]
    ): void {
        const treeNodes = items.map(
            p =>
            ({
                id: uuid(),
                parent: this.model.root as CompositeTreeNode,
                selected: false,
                part: p,
            } as ChatPartNode)
        );
        this.refreshModelChildren(treeNodes);
    }

    public set response(response: ChatResponse) {
        this.fillPropertiesTree(response.parts);
    }

    /**
     * Rendering
     */
    private async refreshModelChildren(treeNodes: TreeNode[]): Promise<void> {
        if (CompositeTreeNode.is(this.model.root)) {
            this.model.root.children = treeNodes;
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
        if (isChatPartNode(node)) {
            if (isChatRequestPart(node.part)) {
                return this.renderChatRequestPart(node.part);
            }
            if (isTextChatResponsePart(node.part)) {
                return this.renderTextChatPart(node.part);
            }
            if (isTextStreamChatResponsePart(node.part)) {
                return this.renderTextStreamChatPart(node.part);
            }
        }
        return super.renderNode(node, props);
    }

    private renderChatRequestPart(part: ChatRequestPart): React.ReactNode {
        return (
            <React.Fragment>
                <div>
                    <label className={codicon('account')}></label>
                </div>
                <div className={'theia-TextChatPartNode'}>{part.query}</div>
            </React.Fragment>
        );
    }
    private renderTextChatPart(part: TextChatResponsePart): React.ReactNode {
        return (
            <React.Fragment>
                <div>
                    <label className={codicon('copilot')}></label>
                </div>
                <div className={'theia-TextChatPartNode'}>{part.message}</div>
            </React.Fragment>
        );
    }
    private renderTextStreamChatPart(
        part: TextStreamChatResponsePart
    ): React.ReactNode {
        return <TextStreamChatPart stream={part.stream} />;
    }
}
interface ChatPartNode extends SelectableTreeNode {
    parent: CompositeTreeNode;
    part: ChatRequestPart | ChatResponsePart;
}
const isChatPartNode = (node: TreeNode): node is ChatPartNode =>
    SelectableTreeNode.is(node) && 'part' in node;

const TextStreamChatPart = (props: { stream: AsyncIterable<string> }) => {
    const [message, setMessage] = useState('');
    useEffect(() => {
        const parseTokens = async () => {
            for await (const token of props.stream) {
                setMessage(oldMessage => oldMessage + token);
            }
        };
        parseTokens();
    }, [props.stream]);

    return (
        <React.Fragment>
            <div>
                <label className={codicon('copilot')}></label>
            </div>
            <div className={'theia-TextStreamChatPartNode'}>{message}</div>
        </React.Fragment>
    );
};
