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
    CompositeTreeNode,
    ContextMenuRenderer,
    SelectableTreeNode,
    TreeModel,
    TreeNode,
    TreeProps,
    TreeWidget
} from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { useEffect, useState } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';
import { v4 as uuid } from 'uuid';
import { ChatResponse, ChatResponsePart, isTextChatResponsePart, isTextStreamChatResponsePart, TextChatResponsePart, TextStreamChatResponsePart } from '@theia/ai-model-provider';

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
            children: []
        } as CompositeTreeNode;
    }

    @postConstruct()
    protected override init(): void {
        super.init();

        this.id = ChatViewTreeWidget.ID + '-treeContainer';
        this.addClass('treeContainer');
    }

    private fillPropertiesTree(response: ChatResponse): void {
        const treeNodes = response.map(p => this.toTreeNode(p)).filter((n): n is TreeNode => n !== undefined);
        this.refreshModelChildren(treeNodes);
    }
    private toTreeNode(part: ChatResponsePart): TreeNode | undefined {
        if (isTextChatResponsePart(part)) {
            return this.createTextChatPartNode(part);
        }
        if (isTextStreamChatResponsePart(part)) {
            return this.createTextChatStreamPartNode(part);
        }
        return undefined;
    }

    public set response(response: ChatResponse) {
        this.fillPropertiesTree(response);
    }

    /*
    * Creating TreeNodes
    */

    private createTextChatPartNode(part: TextChatResponsePart): TextChatPartNode {
        return {
            id: uuid(),
            parent: this.model.root as CompositeTreeNode,
            selected: false,
            message: part.message
        };
    }
    private createTextChatStreamPartNode(part: TextStreamChatResponsePart): TextStreamChatPartNode {
        return {
            id: uuid(),
            parent: this.model.root as CompositeTreeNode,
            selected: false,
            stream: part.stream
        };
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

    protected override renderNode(node: TreeNode): React.ReactNode {
        if (!TreeNode.isVisible(node)) {
            return undefined;
        }
        if (TextChatPartNode.is(node)) {
            return this.renderTextChatPartNode(node);
        }
        if (TextStreamChatPartNode.is(node)) {
            return this.renderTextStreamChatPartNode(node);
        }
    }

    private renderTextChatPartNode(node: TextChatPartNode): React.ReactNode {
        return <React.Fragment>
            <div className={'theia-TextChatPartNode'}>{node.message}</div>
        </React.Fragment>;
    }
    private renderTextStreamChatPartNode(node: TextStreamChatPartNode): React.ReactNode {
        return <TextStreamChatPart stream={node.stream} />;
    }
}

export interface TextChatPartNode extends SelectableTreeNode {
    parent: CompositeTreeNode;
    message: string;
}
export namespace TextChatPartNode {
    export function is(node: TreeNode | undefined): node is TextChatPartNode {
        return SelectableTreeNode.is(node) && 'message' in node;
    }
}

export interface TextStreamChatPartNode extends SelectableTreeNode {
    parent: CompositeTreeNode;
    stream: AsyncIterable<string>;
}
export namespace TextStreamChatPartNode {
    export function is(node: TreeNode | undefined): node is TextStreamChatPartNode {
        return SelectableTreeNode.is(node) && 'stream' in node;
    }
}

const TextStreamChatPart = (props: { stream: AsyncIterable<string> }) => {
    const [message, setMessage] = useState('');
    useEffect(() => {
        const parseTokens = async () => {
            for await (const token of props.stream) {
                const newMessage = message + token;
                setMessage(newMessage);
            }
        };
        parseTokens();
    }, []);

    return <div className={'theia-TextStreamChatPartNode'}>{message}</div>;
};
