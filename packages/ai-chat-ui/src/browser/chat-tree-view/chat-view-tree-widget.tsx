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
    BaseChatResponseContent,
    ChatAgentService,
    ChatModel,
    ChatRequestModel,
    ChatResponseContent,
    ChatResponseModel,
} from '@theia/ai-chat';
import { ContributionProvider } from '@theia/core';
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
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import {
    inject,
    injectable,
    named,
    postConstruct,
} from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { ChatResponsePartRenderer } from '../types';
import { MarkdownWrapper } from '../chat-response-renderer/markdown-part-renderer';

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

    @inject(ContributionProvider) @named(ChatResponsePartRenderer)
    protected readonly chatResponsePartRenderers: ContributionProvider<ChatResponsePartRenderer<BaseChatResponseContent>>;

    @inject(MarkdownRenderer)
    private renderer: MarkdownRenderer;

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    protected _shouldScrollToEnd = true;

    set shouldScrollToEnd(shouldScrollToEnd: boolean) {
        this._shouldScrollToEnd = shouldScrollToEnd;
        this.shouldScrollToRow = this._shouldScrollToEnd;
    }

    get shouldScrollToEnd(): boolean {
        return this._shouldScrollToEnd;
    }

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
                request.response.onDidChange(() => this.scheduleUpdateScrollToRow());
            }
        });
        chatModel.onDidChange(event => {
            if (event.kind === 'addRequest') {
                this.recreateModelTree(chatModel);
                if (!event.request.response.isComplete) {
                    event.request.response.onDidChange(() => this.scheduleUpdateScrollToRow());
                }
            }
        });
    }

    protected override getScrollToRow(): number | undefined {
        if (this.shouldScrollToEnd) {
            return this.rows.size;
        }
        return super.getScrollToRow();
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
        if (!(isRequestNode(node) || isResponseNode(node))) {
            return super.renderNode(node, props);
        }
        return <React.Fragment key={node.id}>
            <div className='theia-ChatNode'>
                {this.renderAgent(node)}
                {this.renderDetail(node)}
            </div>
        </React.Fragment>;
    }
    private renderAgent(node: RequestNode | ResponseNode): React.ReactNode {
        const inProgress = isResponseNode(node) && !node.response.isComplete && !node.response.isCanceled;
        return <React.Fragment>
            <div className='theia-ChatNodeHeader'>
                <div className={`theia-AgentAvatar ${this.getAgentIconClassName(node)}`}></div>
                <h3 className='theia-AgentLabel'>{this.getAgentLabel(node)}</h3>
                {(inProgress && <span className='theia-ChatContentInProgress'>Generating</span>)}
            </div>
        </React.Fragment>;
    }
    private getAgentLabel(node: RequestNode | ResponseNode): string {
        if (isRequestNode(node)) {
            // TODO find user name
            return 'Me';
        }

        const agent = node.response.agentId ? this.chatAgentService.getAgent(node.response.agentId) : undefined;
        return agent?.name ?? 'AI';
    }
    private getAgentIconClassName(node: RequestNode | ResponseNode): string | undefined {
        if (isRequestNode(node)) {
            return codicon('account');
        }

        const agent = node.response.agentId ? this.chatAgentService.getAgent(node.response.agentId) : undefined;
        return agent?.iconClass ?? codicon('copilot');
    }

    private renderDetail(node: RequestNode | ResponseNode): React.ReactNode {
        if (isRequestNode(node)) {
            return this.renderChatRequest(node);
        }
        if (isResponseNode(node)) {
            return this.renderChatResponse(node);
        };
    }

    private renderChatRequest(node: RequestNode): React.ReactNode {
        const text = node.request.request.displayText ?? node.request.request.text;
        const markdownString = new MarkdownStringImpl(text, { supportHtml: true, isTrusted: true });
        return (
            <div className={'theia-RequestNode'}>
                {<MarkdownWrapper
                    data={markdownString}
                    renderCallback={() => this.renderer.render(markdownString).element}
                ></MarkdownWrapper>}
            </div>
        );
    }

    private renderChatResponse(node: ResponseNode): React.ReactNode {
        return (
            <div className={'theia-ResponseNode'}>
                {node.response.response.content.map((c, i) =>
                    <div className='theia-ResponseNode-Content' key={`${node.id}-content-${i}`}>{this.getChatReponsePartRenderer(c)}</div>
                )}
            </div>
        );
    }

    private getChatReponsePartRenderer(content: ChatResponseContent): React.ReactNode {
        const contributions = this.chatResponsePartRenderers.getContributions();
        const renderer = contributions.map(c => ({ prio: c.canHandle(content), renderer: c })).sort((a, b) => b.prio - a.prio)[0].renderer;
        return renderer.render(content);
    }
}
