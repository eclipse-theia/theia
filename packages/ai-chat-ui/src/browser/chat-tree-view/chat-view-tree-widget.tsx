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
    ChatAgentService,
    ChatModel,
    ChatProgressMessage,
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
import {
    inject,
    injectable,
    named,
    postConstruct
} from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

import { ChatNodeToolbarActionContribution } from '../chat-node-toolbar-action-contribution';
import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { useMarkdownRendering } from '../chat-response-renderer/markdown-part-renderer';

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

function isEnterKey(e: React.KeyboardEvent): boolean {
    return Key.ENTER.keyCode === KeyCode.createKeyCode(e.nativeEvent).key?.keyCode;
}

@injectable()
export class ChatViewTreeWidget extends TreeWidget {
    static readonly ID = 'chat-tree-widget';
    static readonly CONTEXT_MENU = ['chat-tree-context-menu'];

    @inject(ContributionProvider) @named(ChatResponsePartRenderer)
    protected readonly chatResponsePartRenderers: ContributionProvider<ChatResponsePartRenderer<ChatResponseContent>>;

    @inject(ContributionProvider) @named(ChatNodeToolbarActionContribution)
    protected readonly chatNodeToolbarActionContributions: ContributionProvider<ChatNodeToolbarActionContribution>;

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
                            {this.renderLinkButton('the settings menu', CommonCommands.OPEN_PREFERENCES.id)}
                            &nbsp;and locate the <strong>AI Features</strong> section.</p>
                        <ol>
                            <li>Toggle the switch for <strong>'Ai-features: Enable'</strong>.</li>
                            <li>Provide at least one LLM provider (e.g. OpenAI), also see <a href="https://theia-ide.org/docs/user_ai/" target="_blank">the documentation</a>
                                for more information.</li>
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
                            <li>Terminal Assistance (via CTRL+I in a terminal)</li>
                            <li>This Chat View (features the following agents):
                                <ul>
                                    <li>Universal Chat Agent</li>
                                    <li>Workspace Chat Agent</li>
                                    <li>Command Chat Agent</li>
                                    <li>Orchestrator Chat Agent</li>
                                </ul>
                            </li>
                            <li>{this.renderLinkButton('AI History View', 'aiHistory:open')}</li>
                            <li>{this.renderLinkButton('AI Configuration View', 'aiConfiguration:open')}</li>
                        </ul>
                        <p>See <a href="https://theia-ide.org/docs/user_ai/" target="_blank">the documentation</a> for more information.</p>
                    </div>
                </div>
            </div>
        </div >;
    }

    private renderLinkButton(title: string, openCommandId: string): React.ReactNode {
        return <a
            role={'button'}
            tabIndex={0}
            onClick={() => this.commandRegistry.executeCommand(openCommandId)}
            onKeyDown={e => isEnterKey(e) && this.commandRegistry.executeCommand(openCommandId)}>
            {title}
        </a>;
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
     * Tracks the ChatModel handed over.
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
                this.recreateModelTree(chatModel);
                if (event.kind === 'addRequest' && !event.request.response.isComplete) {
                    event.request.response.onDidChange(() => this.scheduleUpdateScrollToRow());
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
        const toolbarContributions = !inProgress
            ? this.chatNodeToolbarActionContributions.getContributions()
                .flatMap(c => c.getToolbarActions(node))
                .filter(action => this.commandRegistry.isEnabled(action.commandId, node))
                .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
            : [];
        return <React.Fragment>
            <div className='theia-ChatNodeHeader'>
                <div className={`theia-AgentAvatar ${this.getAgentIconClassName(node)}`}></div>
                <h3 className='theia-AgentLabel'>{this.getAgentLabel(node)}</h3>
                {inProgress && <span className='theia-ChatContentInProgress'>Generating</span>}
                <div className='theia-ChatNodeToolbar'>
                    {!inProgress &&
                        toolbarContributions.length > 0 &&
                        toolbarContributions.map(action =>
                            <span
                                className={`theia-ChatNodeToolbarAction ${action.icon}`}
                                title={action.tooltip}
                                onClick={e => {
                                    e.stopPropagation();
                                    this.commandRegistry.executeCommand(action.commandId, node);
                                }}
                                onKeyDown={e => {
                                    if (isEnterKey(e)) {
                                        e.stopPropagation();
                                        this.commandRegistry.executeCommand(action.commandId, node);
                                    }
                                }}
                                role='button'
                            ></span>
                        )}
                </div>
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
        return <ChatRequestRender node={node} />;
    }

    private renderChatResponse(node: ResponseNode): React.ReactNode {
        return (
            <div className={'theia-ResponseNode'}>
                {!node.response.isComplete
                    && node.response.response.content.length === 0
                    && node.response.progressMessages.map((c, i) =>
                        <ProgressMessage {...c} key={`${node.id}-progress-${i}`} />
                    )}
                {node.response.response.content.map((c, i) =>
                    <div className='theia-ResponseNode-Content' key={`${node.id}-content-${i}`}>{this.getChatResponsePartRenderer(c, node)}</div>
                )}
            </div>
        );
    }

    private getChatResponsePartRenderer(content: ChatResponseContent, node: ResponseNode): React.ReactNode {
        const renderer = this.chatResponsePartRenderers.getContributions().reduce<[number, ChatResponsePartRenderer<ChatResponseContent> | undefined]>(
            (prev, current) => {
                const prio = current.canHandle(content);
                if (prio > prev[0]) {
                    return [prio, current];
                } return prev;
            },
            [-1, undefined])[1];
        if (!renderer) {
            console.error('No renderer found for content', content);
            return <div>Error: No renderer found</div>;
        }
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

const ChatRequestRender = ({ node }: { node: RequestNode }) => {
    const text = node.request.request.displayText ?? node.request.request.text;
    const ref = useMarkdownRendering(text);

    return <div className={'theia-RequestNode'} ref={ref}></div>;
};

const ProgressMessage = (c: ChatProgressMessage) => (
    <div className='theia-ResponseNode-ProgressMessage'>
        <Indicator {...c} /> {c.content}
    </div>
);

const Indicator = (progressMessage: ChatProgressMessage) => (
    <span className='theia-ResponseNode-ProgressMessage-Indicator'>
        {progressMessage.status === 'inProgress' &&
            <i className={'fa fa-spinner fa-spin ' + progressMessage.status}></i>
        }
        {progressMessage.status === 'completed' &&
            <i className={'fa fa-check ' + progressMessage.status}></i>
        }
        {progressMessage.status === 'failed' &&
            <i className={'fa fa-warning ' + progressMessage.status}></i>
        }
    </span>
);
