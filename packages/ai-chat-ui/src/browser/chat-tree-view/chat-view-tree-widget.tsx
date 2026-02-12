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
    ChatAgent,
    ChatAgentService,
    ChatModel,
    ChatRequestModel,
    ChatResponseContent,
    ChatResponseModel,
    ChatService,
    EditableChatRequestModel,
    ParsedChatRequestAgentPart,
    ParsedChatRequestFunctionPart,
    ParsedChatRequestVariablePart,
    type ChatRequest,
    type ChatHierarchyBranch,
} from '@theia/ai-chat';
import { ImageContextVariable } from '@theia/ai-chat/lib/common/image-context-variable';
import { AIVariableService } from '@theia/ai-core';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { CommandRegistry, ContributionProvider, Disposable, DisposableCollection, Emitter, Event } from '@theia/core';
import {
    codicon,
    CompositeTreeNode,
    ContextMenuRenderer,
    HoverService,
    Key,
    KeyCode,
    NodeProps,
    OpenerService,
    TreeModel,
    TreeNode,
    TreeProps,
    TreeWidget,
    Widget,
    type ReactWidget
} from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { nls } from '@theia/core/lib/common/nls';
import {
    inject,
    injectable,
    named,
    optional,
    postConstruct
} from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ChatNodeToolbarActionContribution } from '../chat-node-toolbar-action-contribution';
import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { useMarkdownRendering } from '../chat-response-renderer/markdown-part-renderer';
import { ProgressMessage } from '../chat-progress-message';
import { AIChatTreeInputFactory, type AIChatTreeInputWidget } from './chat-view-tree-input-widget';
import { PromptVariantBadge } from './prompt-variant-badge';

// TODO Instead of directly operating on the ChatRequestModel we could use an intermediate view model
export interface RequestNode extends TreeNode {
    request: ChatRequestModel,
    branch: ChatHierarchyBranch,
    sessionId: string
}
export const isRequestNode = (node: TreeNode): node is RequestNode => 'request' in node;

export interface EditableRequestNode extends RequestNode {
    request: EditableChatRequestModel
}
export const isEditableRequestNode = (node: TreeNode): node is EditableRequestNode => isRequestNode(node) && EditableChatRequestModel.is(node.request);

// TODO Instead of directly operating on the ChatResponseModel we could use an intermediate view model
export interface ResponseNode extends TreeNode {
    response: ChatResponseModel,
    sessionId: string
}
export const isResponseNode = (node: TreeNode): node is ResponseNode => 'response' in node;

export function isEnterKey(e: React.KeyboardEvent): boolean {
    return Key.ENTER.keyCode === KeyCode.createKeyCode(e.nativeEvent).key?.keyCode;
}

export const ChatWelcomeMessageProvider = Symbol('ChatWelcomeMessageProvider');
export interface ChatWelcomeMessageProvider {
    renderWelcomeMessage?(): React.ReactNode;
    renderDisabledMessage?(): React.ReactNode;
    readonly hasReadyModels?: boolean;
    readonly modelRequirementBypassed?: boolean;
    readonly defaultAgent?: string;
    readonly onStateChanged?: Event<void>;
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

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(CommandRegistry)
    protected commandRegistry: CommandRegistry;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(HoverService)
    protected hoverService: HoverService;

    @inject(ChatWelcomeMessageProvider) @optional()
    protected welcomeMessageProvider?: ChatWelcomeMessageProvider;

    @inject(AIChatTreeInputFactory)
    protected inputWidgetFactory: AIChatTreeInputFactory;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    protected chatResponseFocusKey: ContextKey<boolean>;

    protected readonly onDidSubmitEditEmitter = new Emitter<ChatRequest>();
    onDidSubmitEdit = this.onDidSubmitEditEmitter.event;

    protected readonly chatInputs: Map<string, AIChatTreeInputWidget> = new Map();

    protected _shouldScrollToEnd = true;

    protected isEnabled = false;

    protected chatModelId: string;

    /** Tracks if we are at the bottom for showing the scroll-to-bottom button. */
    protected atBottom = true;
    /**
     * Track the visibility of the scroll button with debounce logic. Used to prevent flickering when streaming tokens.
     */
    protected _showScrollButton = false;
    /**
     * Timer for debouncing the scroll button activation (prevents flicker on auto-scroll).
     * If user scrolls up, this delays showing the button in case auto-scroll-to-bottom kicks in.
     */
    protected _scrollButtonDebounceTimer?: number;
    /**
     * Debounce period in ms before showing scroll-to-bottom button after scrolling up.
     * Avoids flickering of the button during LLM token streaming.
     */
    protected static readonly SCROLL_BUTTON_GRACE_PERIOD = 100;

    onScrollLockChange?: (temporaryLocked: boolean) => void;

    protected lastScrollTop = 0;

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

        this.chatResponseFocusKey = this.contextKeyService.createKey<boolean>('chatResponseFocus', false);
        this.node.setAttribute('tabindex', '0');
        this.node.setAttribute('aria-label', nls.localize('theia/ai/chat-ui/chatResponses', 'Chat responses'));
        this.addEventListener(this.node, 'focusin', () => this.chatResponseFocusKey.set(true));
        this.addEventListener(this.node, 'focusout', () => this.chatResponseFocusKey.set(false));

        this.toDispose.pushAll([
            this.toDisposeOnChatModelChange,
            this.activationService.onDidChangeActiveStatus(change => {
                this.chatInputs.forEach(widget => {
                    widget.setEnabled(change);
                });
                this.update();
            }),
            this.onScroll(scrollEvent => {
                this.handleScrollEvent(scrollEvent);
            })
        ]);

        if (this.welcomeMessageProvider?.onStateChanged) {
            this.toDispose.push(
                this.welcomeMessageProvider.onStateChanged(() => {
                    this.update();
                })
            );
        }

        // Initialize lastScrollTop with current scroll position
        this.lastScrollTop = this.getCurrentScrollTop(undefined);
    }

    public setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        this.update();
    }

    protected handleScrollEvent(scrollEvent: unknown): void {
        const currentScrollTop = this.getCurrentScrollTop(scrollEvent);
        const isScrollingUp = currentScrollTop < this.lastScrollTop;
        const isScrollingDown = currentScrollTop > this.lastScrollTop;
        const isAtBottom = this.isScrolledToBottom();
        const isAtAbsoluteBottom = this.isAtAbsoluteBottom();

        // Asymmetric threshold logic to prevent jitter:
        if (this.shouldScrollToEnd && isScrollingUp) {
            if (!isAtAbsoluteBottom) {
                this.setTemporaryScrollLock(true);
            }
        } else if (!this.shouldScrollToEnd && isAtBottom && isScrollingDown) {
            this.setTemporaryScrollLock(false);
        }

        this.updateScrollToBottomButtonState(isAtBottom);

        this.lastScrollTop = currentScrollTop;
    }

    /** Updates the scroll-to-bottom button state and handles debounce. */
    protected updateScrollToBottomButtonState(isAtBottom: boolean): void {
        const atBottomNow = isAtBottom; // Use isScrolledToBottom for threshold
        if (atBottomNow !== this.atBottom) {
            this.atBottom = atBottomNow;
            if (this.atBottom) {
                // We're at the bottom, hide the button immediately and clear any debounce timer.
                this._showScrollButton = false;
                if (this._scrollButtonDebounceTimer !== undefined) {
                    clearTimeout(this._scrollButtonDebounceTimer);
                    this._scrollButtonDebounceTimer = undefined;
                }
                this.update();
            } else {
                // User scrolled up; delay showing the scroll-to-bottom button.
                if (this._scrollButtonDebounceTimer !== undefined) {
                    clearTimeout(this._scrollButtonDebounceTimer);
                }
                this._scrollButtonDebounceTimer = window.setTimeout(() => {
                    // Re-check: only show if we're still not at bottom
                    if (!this.atBottom) {
                        this._showScrollButton = true;
                        this.update();
                    }
                    this._scrollButtonDebounceTimer = undefined;
                }, ChatViewTreeWidget.SCROLL_BUTTON_GRACE_PERIOD);
            }
        }
    }

    protected setTemporaryScrollLock(enabled: boolean): void {
        // Immediately apply scroll lock changes without delay
        this.onScrollLockChange?.(enabled);
        // Update cached scrollToRow so that outdated values do not cause unwanted scrolling on update()
        this.updateScrollToRow();
    }

    protected getCurrentScrollTop(scrollEvent: unknown): number {
        // For virtualized trees, use the virtualized view's scroll state (most reliable)
        if (this.props.virtualized !== false && this.view) {
            const scrollState = this.getVirtualizedScrollState();
            if (scrollState !== undefined) {
                return scrollState.scrollTop;
            }
        }

        // Try to extract scroll position from the scroll event
        if (scrollEvent && typeof scrollEvent === 'object' && 'scrollTop' in scrollEvent) {
            const scrollEventWithScrollTop = scrollEvent as { scrollTop: unknown };
            const scrollTop = scrollEventWithScrollTop.scrollTop;
            if (typeof scrollTop === 'number' && !isNaN(scrollTop)) {
                return scrollTop;
            }
        }

        // Last resort: use DOM scroll position
        if (this.node && typeof this.node.scrollTop === 'number') {
            return this.node.scrollTop;
        }

        return 0;
    }

    /**
     * Returns true if the scroll position is at the absolute (1px tolerance) bottom of the scroll container.
     * Handles both virtualized and non-virtualized scroll containers.
     * Allows for a tiny floating point epsilon (1px).
     */
    protected isAtAbsoluteBottom(): boolean {
        let scrollTop: number = 0;
        let scrollHeight: number = 0;
        let clientHeight: number = 0;
        const EPSILON = 1; // px
        if (this.props.virtualized !== false && this.view) {
            const state = this.getVirtualizedScrollState();
            if (state) {
                scrollTop = state.scrollTop;
                scrollHeight = state.scrollHeight ?? 0;
                clientHeight = state.clientHeight ?? 0;
            }
        } else if (this.node) {
            scrollTop = this.node.scrollTop;
            scrollHeight = this.node.scrollHeight;
            clientHeight = this.node.clientHeight;
        }
        const diff = Math.abs(scrollTop + clientHeight - scrollHeight);
        return diff <= EPSILON;
    }

    protected override renderTree(model: TreeModel): React.ReactNode {
        if (!this.isEnabled) {
            return this.renderDisabledMessage();
        }

        const tree = CompositeTreeNode.is(model.root) && model.root.children?.length > 0
            ? super.renderTree(model)
            : this.renderWelcomeMessage();

        return <React.Fragment>
            {tree}
            {this.renderScrollToBottomButton()}
        </React.Fragment>;
    }

    /** Shows the scroll to bottom button if not at the bottom (debounced). */
    protected renderScrollToBottomButton(): React.ReactNode {
        if (!this._showScrollButton) {
            return undefined;
        }
        // Down-arrow, Theia codicon, fixed overlay on widget
        return <button
            className="theia-ChatTree-ScrollToBottom codicon codicon-arrow-down"
            title={nls.localize('theia/ai/chat-ui/chat-view-tree-widget/scrollToBottom', 'Jump to latest message')}
            onClick={() => this.handleScrollToBottomButtonClick()}
        />;
    }

    /** Scrolls to the bottom row and updates atBottom state. */
    protected handleScrollToBottomButtonClick(): void {
        this.scrollToRow = this.rows.size;
        this.atBottom = true;
        this._showScrollButton = false;
        if (this._scrollButtonDebounceTimer !== undefined) {
            clearTimeout(this._scrollButtonDebounceTimer);
            this._scrollButtonDebounceTimer = undefined;
        }
        this.update();
    }

    protected renderDisabledMessage(): React.ReactNode {
        return this.welcomeMessageProvider?.renderDisabledMessage?.() ?? <></>;
    }

    protected renderWelcomeMessage(): React.ReactNode {
        return this.welcomeMessageProvider?.renderWelcomeMessage?.() ?? <></>;
    }

    protected mapRequestToNode(branch: ChatHierarchyBranch): RequestNode {
        return {
            parent: this.model.root as CompositeTreeNode,
            get id(): string {
                return this.request.id;
            },
            get request(): ChatRequestModel {
                return branch.get();
            },
            branch,
            sessionId: this.chatModelId
        };
    }

    protected mapResponseToNode(response: ChatResponseModel): ResponseNode {
        return {
            id: response.id,
            parent: this.model.root as CompositeTreeNode,
            response,
            sessionId: this.chatModelId
        };
    }

    protected readonly toDisposeOnChatModelChange = new DisposableCollection();

    /**
     * Tracks the ChatModel handed over.
     * Tracking multiple chat models will result in a weird UI
     */
    public trackChatModel(chatModel: ChatModel): void {
        this.toDisposeOnChatModelChange.dispose();
        this.recreateModelTree(chatModel);

        chatModel.getRequests().forEach(request => {
            if (!request.response.isComplete) {
                request.response.onDidChange(() => this.scheduleUpdateScrollToRow());
            }
        });
        this.toDisposeOnChatModelChange.pushAll([
            Disposable.create(() => {
                this.chatInputs.forEach(widget => widget.dispose());
                this.chatInputs.clear();
            }),
            chatModel.onDidChange(event => {
                if (event.kind === 'enableEdit') {
                    this.scrollToRow = this.rows.get(event.request.id)?.index;
                    this.update();
                    return;
                } else if (event.kind === 'cancelEdit') {
                    this.disposeChatInputWidget(event.request);
                    this.scrollToRow = undefined;
                    this.update();
                    return;
                } else if (event.kind === 'changeHierarchyBranch') {
                    this.scrollToRow = undefined;
                }

                this.recreateModelTree(chatModel);

                if (event.kind === 'addRequest' && !event.request.response.isComplete) {
                    event.request.response.onDidChange(() => this.scheduleUpdateScrollToRow());
                } else if (event.kind === 'submitEdit') {
                    event.branch.succeedingBranches().forEach(branch => {
                        this.disposeChatInputWidget(branch.get());
                    });
                    this.onDidSubmitEditEmitter.fire(
                        event.newRequest,
                    );
                }
            })
        ]);
    }

    protected disposeChatInputWidget(request: ChatRequestModel): void {
        const widget = this.chatInputs.get(request.id);
        if (widget) {
            widget.dispose();
            this.chatInputs.delete(request.id);
        }
    }

    protected override getScrollToRow(): number | undefined {
        // Only scroll to end if auto-scroll is enabled (not locked)
        if (this.shouldScrollToEnd) {
            return this.rows.size;
        }
        // When auto-scroll is disabled, don't auto-scroll at all
        return undefined;
    }

    protected async recreateModelTree(chatModel: ChatModel): Promise<void> {
        if (CompositeTreeNode.is(this.model.root)) {
            const nodes: TreeNode[] = [];
            this.chatModelId = chatModel.id;
            chatModel.getBranches().forEach(branch => {
                const request = branch.get();
                nodes.push(this.mapRequestToNode(branch));
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
        const ariaLabel = isRequestNode(node)
            ? nls.localize('theia/ai/chat-ui/yourMessage', 'Your message')
            : nls.localize('theia/ai/chat-ui/responseFrom', 'Response from {0}', this.getAgentLabel(node));
        return <React.Fragment key={node.id}>
            <div
                className='theia-ChatNode'
                role='article'
                aria-label={ariaLabel}
                onContextMenu={e => this.handleContextMenu(node, e)}
            >
                {this.renderAgent(node)}
                {this.renderDetail(node)}
            </div>
        </React.Fragment>;
    }

    protected renderAgent(node: RequestNode | ResponseNode): React.ReactNode {
        const inProgress = isResponseNode(node) && !node.response.isComplete && !node.response.isCanceled && !node.response.isError;
        const waitingForInput = isResponseNode(node) && node.response.isWaitingForInput;
        const toolbarContributions = !inProgress
            ? this.chatNodeToolbarActionContributions.getContributions()
                .flatMap(c => c.getToolbarActions(node))
                .filter(action => this.commandRegistry.isEnabled(action.commandId, node))
                .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
            : [];
        const agentLabel = React.createRef<HTMLHeadingElement>();
        const agentDescription = this.getAgent(node)?.description;

        const promptVariantId = isResponseNode(node) ? node.response.promptVariantId : undefined;
        const isPromptVariantEdited = isResponseNode(node) ? !!node.response.isPromptVariantEdited : false;

        return <React.Fragment>
            <div className='theia-ChatNodeHeader'>
                <div className={`theia-AgentAvatar ${this.getAgentIconClassName(node)}`}></div>
                <h3 ref={agentLabel}
                    className='theia-AgentLabel'
                    onMouseEnter={() => {
                        if (agentDescription) {
                            this.hoverService.requestHover({
                                content: agentDescription,
                                target: agentLabel.current!,
                                position: 'right'
                            });
                        }
                    }}>
                    {this.getAgentLabel(node)}
                </h3>
                {promptVariantId && (
                    <PromptVariantBadge
                        variantId={promptVariantId}
                        isEdited={isPromptVariantEdited}
                        hoverService={this.hoverService}
                    />
                )}
                {inProgress && !waitingForInput &&
                    <span className='theia-ChatContentInProgress' role='status' aria-live='polite'>
                        {nls.localize('theia/ai/chat-ui/chat-view-tree-widget/generating', 'Generating')}
                    </span>}
                {inProgress && waitingForInput &&
                    <span className='theia-ChatContentInProgress' role='status' aria-live='polite'>
                        {nls.localize('theia/ai/chat-ui/chat-view-tree-widget/waitingForInput', 'Waiting for input')}
                    </span>}
                <div className='theia-ChatNodeToolbar'>
                    {!inProgress &&
                        toolbarContributions.length > 0 &&
                        toolbarContributions.map(action =>
                            <span
                                key={action.commandId}
                                className={`theia-ChatNodeToolbarAction ${action.icon}`}
                                title={action.tooltip}
                                aria-label={action.tooltip}
                                tabIndex={0}
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

    protected getAgentLabel(node: RequestNode | ResponseNode): string {
        if (isRequestNode(node)) {
            // TODO find user name
            return nls.localize('theia/ai/chat-ui/chat-view-tree-widget/you', 'You');
        }
        return this.getAgent(node)?.name ?? nls.localize('theia/ai/chat-ui/chat-view-tree-widget/ai', 'AI');
    }

    protected getAgent(node: RequestNode | ResponseNode): ChatAgent | undefined {
        if (isRequestNode(node)) {
            return undefined;
        }
        return node.response.agentId ? this.chatAgentService.getAgent(node.response.agentId) : undefined;
    }

    protected getAgentIconClassName(node: RequestNode | ResponseNode): string | undefined {
        if (isRequestNode(node)) {
            return codicon('account');
        }

        const agent = node.response.agentId ? this.chatAgentService.getAgent(node.response.agentId) : undefined;
        return agent?.iconClass ?? codicon('copilot');
    }

    protected renderDetail(node: RequestNode | ResponseNode): React.ReactNode {
        if (isRequestNode(node)) {
            return this.renderChatRequest(node);
        }
        if (isResponseNode(node)) {
            return this.renderChatResponse(node);
        };
    }

    protected renderChatRequest(node: RequestNode): React.ReactNode {
        return <ChatRequestRender
            node={node}
            hoverService={this.hoverService}
            chatAgentService={this.chatAgentService}
            variableService={this.variableService}
            openerService={this.openerService}
            provideChatInputWidget={() => {
                const editableNode = node;
                if (isEditableRequestNode(editableNode)) {
                    let widget = this.chatInputs.get(editableNode.id);
                    if (!widget) {
                        widget = this.inputWidgetFactory({
                            node: editableNode,
                            initialValue: editableNode.request.message.request.text,
                            onQuery: async query => {
                                editableNode.request.submitEdit({ text: query });
                            },
                            branch: editableNode.branch
                        });

                        this.chatInputs.set(editableNode.id, widget);

                        widget.disposed.connect(() => {
                            this.chatInputs.delete(editableNode.id);
                            editableNode.request.cancelEdit();
                        });
                    }

                    return widget;
                }

                return;
            }}
        />;
    }

    protected renderChatResponse(node: ResponseNode): React.ReactNode {
        return (
            <div className={'theia-ResponseNode'}>
                {!node.response.isComplete
                    && node.response.response.content.length === 0
                    && node.response.progressMessages
                        .filter(c => c.show === 'untilFirstContent')
                        .map((c, i) =>
                            <ProgressMessage {...c} key={`${node.id}-progress-untilFirstContent-${i}`} />
                        )
                }
                {node.response.response.content.map((c, i) =>
                    <div className='theia-ResponseNode-Content' key={`${node.id}-content-${i}`}>{this.getChatResponsePartRenderer(c, node)}</div>
                )}
                {!node.response.isComplete
                    && node.response.progressMessages
                        .filter(c => c.show === 'whileIncomplete')
                        .map((c, i) =>
                            <ProgressMessage {...c} key={`${node.id}-progress-whileIncomplete-${i}`} />
                        )
                }
                {node.response.progressMessages
                    .filter(c => c.show === 'forever')
                    .map((c, i) =>
                        <ProgressMessage {...c} key={`${node.id}-progress-afterComplete-${i}`} />
                    )
                }
            </div>
        );
    }

    protected getChatResponsePartRenderer(content: ChatResponseContent, node: ResponseNode): React.ReactNode {
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
            return <div>{nls.localize('theia/ai/chat-ui/chat-view-tree-widget/noRenderer', 'Error: No renderer found')}</div>;
        }
        return renderer.render(content, node);
    }

    protected handleContextMenu(node: TreeNode | undefined, event: React.MouseEvent<HTMLElement>): void {
        this.contextMenuRenderer.render({
            menuPath: ChatViewTreeWidget.CONTEXT_MENU,
            anchor: { x: event.clientX, y: event.clientY },
            args: [node],
            context: event.currentTarget
        });
        event.preventDefault();
    }

    protected override handleSpace(event: KeyboardEvent): boolean {
        // We need to return false to prevent the handler within
        // packages/core/src/browser/widgets/widget.ts
        // Otherwise, the space key will never be handled by the monaco editor
        return false;
    }

    /**
     * Ensure atBottom state is correct when content grows (e.g., LLM streaming while scroll lock is enabled).
     */
    protected override updateScrollToRow(): void {
        super.updateScrollToRow();
        const isAtBottom = this.isScrolledToBottom();
        this.updateScrollToBottomButtonState(isAtBottom);
    }

}

interface WidgetContainerProps {
    widget: ReactWidget;
}

const WidgetContainer: React.FC<WidgetContainerProps> = ({ widget }) => {
    // eslint-disable-next-line no-null/no-null
    const containerRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        if (containerRef.current && !widget.isAttached) {
            Widget.attach(widget, containerRef.current);
        }
    }, [containerRef.current]);

    // Clean up
    React.useEffect(() =>
        () => {
            setTimeout(() => {
                // Delay clean up to allow react to finish its rendering cycle
                widget.clearFlag(Widget.Flag.IsAttached);
                widget.dispose();
            });
        }, []);

    return <div ref={containerRef} />;
};

const ChatRequestRender = (
    {
        node, hoverService, chatAgentService, variableService, openerService,
        provideChatInputWidget
    }: {
        node: RequestNode,
        hoverService: HoverService,
        chatAgentService: ChatAgentService,
        variableService: AIVariableService,
        openerService: OpenerService,
        provideChatInputWidget: () => ReactWidget | undefined,
    }) => {
    const parts = node.request.message.parts;
    if (EditableChatRequestModel.isEditing(node.request)) {
        const widget = provideChatInputWidget();
        if (widget) {
            return <div className="theia-RequestNode">
                <WidgetContainer widget={widget}></WidgetContainer>
            </div>;
        }
    }

    const renderFooter = () => {
        if (node.branch.items.length < 2) {
            return;
        }

        const isFirst = node.branch.activeBranchIndex === 0;
        const isLast = node.branch.activeBranchIndex === node.branch.items.length - 1;

        return (
            <div className='theia-RequestNode-Footer'>
                <div className={`item ${isFirst ? '' : 'enabled'}`}>
                    <div className="codicon codicon-chevron-left action-label" title="Previous" onClick={() => {
                        node.branch.enablePrevious();
                    }}></div>
                </div>
                <small>
                    <span>{node.branch.activeBranchIndex + 1}/</span>
                    <span>{node.branch.items.length}</span>
                </small>
                <div className={`item ${isLast ? '' : 'enabled'}`}>
                    <div className='codicon codicon-chevron-right action-label' title="Next" onClick={() => {
                        node.branch.enableNext();
                    }}></div>
                </div>
            </div>
        );
    };

    // Extract image variables from the request context
    const imageVariables = node.request.context.variables
        .filter(ImageContextVariable.isResolvedImageContext)
        .map(resolved => ImageContextVariable.parseResolved(resolved))
        .filter((img): img is NonNullable<typeof img> => img !== undefined);

    const renderImages = () => {
        if (imageVariables.length === 0) {
            return undefined;
        }
        return (
            <div className="theia-RequestNode-Images">
                {imageVariables.map((img, index) => (
                    <div key={index} className="theia-RequestNode-ImagePreview">
                        <img
                            src={`data:${img.mimeType};base64,${img.data}`}
                            alt={img.name ?? img.wsRelativePath ?? 'Image'}
                            title={img.name ?? img.wsRelativePath ?? 'Image'}
                        />
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="theia-RequestNode">
            <p>
                {parts.map((part, index) => {
                    if (part instanceof ParsedChatRequestAgentPart || part instanceof ParsedChatRequestVariablePart || part instanceof ParsedChatRequestFunctionPart) {
                        let description = undefined;
                        let className = '';
                        if (part instanceof ParsedChatRequestAgentPart) {
                            description = chatAgentService.getAgent(part.agentId)?.description;
                            className = 'theia-RequestNode-AgentLabel';
                        } else if (part instanceof ParsedChatRequestVariablePart) {
                            description = variableService.getVariable(part.variableName)?.description;
                            className = 'theia-RequestNode-VariableLabel';
                        } else if (part instanceof ParsedChatRequestFunctionPart) {
                            description = part.toolRequest?.description;
                            className = 'theia-RequestNode-FunctionLabel';
                        }
                        return (
                            <HoverableLabel
                                key={index}
                                text={part.text}
                                description={description}
                                hoverService={hoverService}
                                className={className}
                            />
                        );
                    } else {
                        const ref = useMarkdownRendering(
                            part.text
                                .replace(/^[\r\n]+|[\r\n]+$/g, '') // remove excessive new lines
                                .replace(/(^ )/g, '&nbsp;'), // enforce keeping space before
                            openerService,
                            true
                        );
                        return (
                            <span key={index} ref={ref}></span>
                        );
                    }
                })}
            </p>
            {renderImages()}
            {renderFooter()}
        </div>
    );
};

const HoverableLabel = (
    {
        text, description, hoverService, className
    }: {
        text: string,
        description?: string,
        hoverService: HoverService,
        className: string
    }) => {
    const spanRef = React.createRef<HTMLSpanElement>();
    return (
        <span
            className={className}
            ref={spanRef}
            onMouseEnter={() => {
                if (description) {
                    hoverService.requestHover({
                        content: description,
                        target: spanRef.current!,
                        position: 'right'
                    });
                }
            }}
        >
            {text}
        </span>
    );
};
