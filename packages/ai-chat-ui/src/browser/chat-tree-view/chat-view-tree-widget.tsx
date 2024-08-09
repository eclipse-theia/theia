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
import { CommandRegistry, ContributionProvider } from '@theia/core';
import {
    codicon,
    CommonCommands,
    CompositeTreeNode,
    ContextMenuRenderer,
    Key,
    KeyCode,
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
import { MarkdownWrapper } from '../chat-response-renderer/markdown-part-renderer';
import { ChatResponsePartRenderer } from '../types';

// TODO Instead of directly operating on the ChatRequestModel we could use an intermediate view model
export interface RequestNode extends TreeNode {
    request: ChatRequestModel
}
export const isRequestNode = (node: TreeNode): node is RequestNode => 'request' in node;

// TODO Instead of directly operating on the ChatResponseModel we could use an intermediate view model
export interface ResponseNode extends TreeNode {
    response: ChatResponseModel
}
export const isResponseNode = (node: TreeNode): node is ResponseNode => 'response' in node;

@injectable()
export class ChatViewTreeWidget extends TreeWidget {
    static readonly ID = 'chat-tree-widget';
    static readonly CONTEXT_MENU = ['chat-tree-context-menu'];

    @inject(ContributionProvider) @named(ChatResponsePartRenderer)
    protected readonly chatResponsePartRenderers: ContributionProvider<ChatResponsePartRenderer<BaseChatResponseContent>>;

    @inject(MarkdownRenderer)
    private renderer: MarkdownRenderer;

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    @inject(CommandRegistry)
    private commandRegistry: CommandRegistry;

    protected _shouldScrollToEnd = true;

    protected isEnabled = false;

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

    public setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        this.update();
    }

    protected override renderTree(model: TreeModel): React.ReactNode {
        if (this.isEnabled) {
            return super.renderTree(model);
        }
        return this.renderDisabledMessage();
    }

    private renderDisabledMessage(): React.ReactNode {
        return <div className={'theia-ResponseNode'}>
            <div className='theia-ResponseNode-Content' key={'disabled-message'}>
                <div className="disable-message">
                    <span className="section-header"> 🚀 Experimental AI Feature Available!</span>
                    <div className="section-title">
                        <p><code>Currently, all AI Features are disabled!</code></p>
                    </div>
                    <div className="section-title">
                        <p>How to Enable Experimental AI Features:</p>
                    </div>
                    <div className="section-content">
                        <p>To enable the experimental AI features, please go to &nbsp;
                            {this.renderLinkButton('the settings menu', this.doOpenPreferences, this.doOpenPreferencesEnter)}
                            &nbsp;and locate the <strong>Extensions &gt; ✨ AI Features [Experimental]</strong> section.</p>
                        <ol>
                            <li>Toggle the switch for <strong>'Ai-features: Enable'</strong>.</li>
                            <li>Provide an OpenAI API Key through the <strong>'OpenAI: API Key'</strong> setting or by
                                setting the <strong>OPENAI_API_KEY</strong> environment variable.</li>
                        </ol>
                        <p>This will activate the new AI capabilities in the app. Please remember, these features are still in development, so they may change or be unstable. 🚧</p>
                    </div>

                    <div className="section-title">
                        <p>Currently Supported Views and Features:</p>
                    </div>
                    <div className="section-content">
                        <p>Once the experimental AI features are enabled, you can access the following views and features:</p>
                        <ul>
                            <li>Code Completion</li>
                            <li>Quick Fixes</li>
                            <li>Terminal Assistance</li>
                            <li>{this.renderLinkButton('AI History View', this.doOpenAIHistory, this.doOpenAIHistoryEnter)}</li>
                            <li>{this.renderLinkButton('AI Configuration View', this.doOpenAIConfiguration, this.doOpenAIConfigurationEnter)}</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div >;
    }

    protected doOpenPreferences = () => this.commandRegistry.executeCommand(CommonCommands.OPEN_PREFERENCES.id);
    protected doOpenPreferencesEnter = (e: React.KeyboardEvent) => {
        if (this.isEnterKey(e)) {
            this.doOpenPreferences();
        }
    };

    protected doOpenAIHistory = () => this.commandRegistry.executeCommand('aiHistory:open');
    protected doOpenAIHistoryEnter = (e: React.KeyboardEvent) => {
        if (this.isEnterKey(e)) {
            this.doOpenAIHistory();
        }
    };

    protected doOpenAIConfiguration = () => this.commandRegistry.executeCommand('aiConfiguration:open');
    protected doOpenAIConfigurationEnter = (e: React.KeyboardEvent) => {
        if (this.isEnterKey(e)) {
            this.doOpenAIConfiguration();
        }
    };

    private renderLinkButton(title: string, onClickHandler: () => Promise<unknown>, onKeyDownHandler: (e: React.KeyboardEvent) => void): React.ReactNode {
        return <a
            role={'button'}
            tabIndex={0}
            onClick={onClickHandler}
            onKeyDown={e => onKeyDownHandler(e)}>
            {title}
        </a>;
    }

    protected isEnterKey(e: React.KeyboardEvent): boolean {
        return Key.ENTER.keyCode === KeyCode.createKeyCode(e.nativeEvent).key?.keyCode;
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
        this.toDispose.push(
            chatModel.onDidChange(event => {
                if (event.kind === 'addRequest') {
                    this.recreateModelTree(chatModel);
                    if (!event.request.response.isComplete) {
                        event.request.response.onDidChange(() => this.scheduleUpdateScrollToRow());
                    }
                }
            })
        );
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
            <div className='theia-ChatNode' onContextMenu={e => this.handleContextMenu(node, e)}>
                {this.renderAgent(node)}
                {this.renderDetail(node)}
            </div>
        </React.Fragment>;
    }
    private renderAgent(node: RequestNode | ResponseNode): React.ReactNode {
        const inProgress = isResponseNode(node) && !node.response.isComplete && !node.response.isCanceled && !node.response.isError;
        return <React.Fragment>
            <div className='theia-ChatNodeHeader'>
                <div className={`theia-AgentAvatar ${this.getAgentIconClassName(node)}`}></div>
                <h3 className='theia-AgentLabel'>{this.getAgentLabel(node)}</h3>
                {inProgress && <span className='theia-ChatContentInProgress'>Generating</span>}
            </div>
        </React.Fragment>;
    }
    private getAgentLabel(node: RequestNode | ResponseNode): string {
        if (isRequestNode(node)) {
            // TODO find user name
            return 'You';
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
                    <div className='theia-ResponseNode-Content' key={`${node.id}-content-${i}`}>{this.getChatResponsePartRenderer(c, node)}</div>
                )}
            </div>
        );
    }

    private getChatResponsePartRenderer(content: ChatResponseContent, node: ResponseNode): React.ReactNode {
        const contributions = this.chatResponsePartRenderers.getContributions();
        const renderer = contributions.map(c => ({ prio: c.canHandle(content), renderer: c })).sort((a, b) => b.prio - a.prio)[0].renderer;
        return renderer.render(content, node);
    }

    protected handleContextMenu(node: TreeNode | undefined, event: React.MouseEvent<HTMLElement>): void {
        this.contextMenuRenderer.render({
            menuPath: ChatViewTreeWidget.CONTEXT_MENU,
            anchor: { x: event.clientX, y: event.clientY },
            args: [node]
        });
        event.preventDefault();
    }
}
