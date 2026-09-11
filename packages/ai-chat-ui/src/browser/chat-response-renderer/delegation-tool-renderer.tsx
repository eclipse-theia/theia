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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ChatRequestInvocation, ChatResponseContent, ChatResponseModel, InteractiveContent, ToolCallChatResponseContent } from '@theia/ai-chat';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import { PendingToolConfirmationTracker } from '@theia/ai-chat/lib/browser/pending-tool-confirmation-tracker';
import { AGENT_DELEGATION_FUNCTION_ID } from '@theia/ai-core/lib/common/tool-constants';
import { ToolInvocationRegistry } from '@theia/ai-core';
import { AgentDelegationTool } from '@theia/ai-chat/lib/browser/agent-delegation-tool';
import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { ResponseNode } from '../chat-tree-view';
import { SubChatWidgetFactory } from '../chat-tree-view/sub-chat-widget';
import { ToolConfirmationKeybindingHints, withToolCallConfirmation } from './tool-confirmation';
import {
    APPROVE_LATEST_TOOL_CONFIRMATION_COMMAND,
    DENY_LATEST_TOOL_CONFIRMATION_COMMAND
} from '../tool-confirmation-keybinding-contribution';
import { extractJsonStringField } from './toolcall-utils';
import { CompositeTreeNode, ContextMenuRenderer, KeybindingRegistry, MarkdownRenderer, OpenerService } from '@theia/core/lib/browser';
import { ContributionProvider, DisposableCollection, nls } from '@theia/core';
import * as React from '@theia/core/shared/react';

@injectable()
export class DelegationToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(AgentDelegationTool)
    protected agentDelegationTool: AgentDelegationTool;

    @inject(ChatAgentService)
    protected readonly chatAgentService: ChatAgentService;

    @inject(SubChatWidgetFactory)
    protected subChatWidgetFactory: SubChatWidgetFactory;

    @inject(ToolConfirmationManager)
    protected toolConfirmationManager: ToolConfirmationManager;

    @inject(ToolInvocationRegistry)
    protected toolInvocationRegistry: ToolInvocationRegistry;

    @inject(ContextMenuRenderer)
    protected contextMenuRenderer: ContextMenuRenderer;

    @inject(OpenerService)
    protected openerService: OpenerService;

    @inject(PendingToolConfirmationTracker)
    protected pendingToolConfirmationTracker: PendingToolConfirmationTracker;

    @inject(KeybindingRegistry)
    protected keybindingRegistry: KeybindingRegistry;

    @inject(MarkdownRenderer)
    protected markdownRenderer: MarkdownRenderer;

    @inject(ContributionProvider) @named(ChatResponsePartRenderer)
    protected chatResponsePartRenderers: ContributionProvider<ChatResponsePartRenderer<ChatResponseContent>>;

    canHandle(response: ChatResponseContent): number {
        if (ToolCallChatResponseContent.is(response) && response.name === AGENT_DELEGATION_FUNCTION_ID) {
            return 20;
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): React.ReactNode {
        const delegation = response.id ? this.agentDelegationTool.getDelegation(response.id) : undefined;

        let agentName = response.name ?? AGENT_DELEGATION_FUNCTION_ID;
        let prompt = '';
        if (response.arguments) {
            try {
                const args = JSON.parse(response.arguments);
                if (typeof args.agentId === 'string') {
                    agentName = this.chatAgentService.getAgent(args.agentId)?.name ?? args.agentId;
                }
                if (typeof args.prompt === 'string') {
                    prompt = args.prompt;
                }
            } catch {
                const partialAgentId = extractJsonStringField(response.arguments, 'agentId');
                if (partialAgentId) {
                    agentName = this.chatAgentService.getAgent(partialAgentId)?.name ?? partialAgentId;
                }
                const partialPrompt = extractJsonStringField(response.arguments, 'prompt');
                if (partialPrompt) {
                    prompt = partialPrompt;
                }
            }
        }

        const chatId = parentNode.sessionId;
        const toolRequest = this.toolInvocationRegistry.getFunction(AGENT_DELEGATION_FUNCTION_ID);
        const confirmationMode = this.toolConfirmationManager.getConfirmationMode(AGENT_DELEGATION_FUNCTION_ID, chatId, toolRequest);

        return <DelegatedChatWithConfirmation
            invocation={delegation?.invocation}
            agentName={agentName}
            prompt={delegation?.prompt ?? prompt}
            finished={response.finished}
            parentNode={parentNode}
            subChatWidgetFactory={this.subChatWidgetFactory}
            contextMenuRenderer={this.contextMenuRenderer}
            chatResponsePartRenderers={this.chatResponsePartRenderers}
            toolConfirmation={{
                response,
                confirmationMode,
                toolConfirmationManager: this.toolConfirmationManager,
                toolRequest,
                chatId,
                requestCanceled: parentNode.response.isCanceled,
                contextMenuRenderer: this.contextMenuRenderer,
                openerService: this.openerService,
                pendingTracker: this.pendingToolConfirmationTracker,
                keybindingHints: this.getKeybindingHints(),
                markdownRenderer: this.markdownRenderer
            }}
        />;
    }

    protected getKeybindingHints(): ToolConfirmationKeybindingHints {
        const allow = this.formatKeybinding(APPROVE_LATEST_TOOL_CONFIRMATION_COMMAND.id);
        const deny = this.formatKeybinding(DENY_LATEST_TOOL_CONFIRMATION_COMMAND.id);
        return { allow, deny };
    }

    protected formatKeybinding(commandId: string): string | undefined {
        const bindings = this.keybindingRegistry.getKeybindingsForCommand(commandId);
        if (!bindings.length) {
            return undefined;
        }
        return this.keybindingRegistry.acceleratorFor(bindings[0], '+').join('+');
    }
}

interface DelegatedChatProps {
    invocation?: ChatRequestInvocation;
    agentName: string;
    prompt: string;
    finished?: boolean;
    parentNode: ResponseNode;
    subChatWidgetFactory: SubChatWidgetFactory;
    contextMenuRenderer: ContextMenuRenderer;
    chatResponsePartRenderers: ContributionProvider<ChatResponsePartRenderer<ChatResponseContent>>;
}

interface DelegatedChatState {
    node?: ResponseNode;
    isOpen: boolean;
}

class DelegatedChat extends React.Component<DelegatedChatProps, DelegatedChatState> {
    private widget: ReturnType<SubChatWidgetFactory>;
    private toDispose = new DisposableCollection();
    private unmounted = false;

    constructor(props: DelegatedChatProps) {
        super(props);
        this.state = {
            node: undefined,
            isOpen: false
        };
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
            // Guard against continuations of a superseded invocation or an unmounted
            // component: they would show the old model's node and register listeners
            // into an already-disposed collection (which silently keeps them alive).
            if (this.unmounted || invocation !== this.props.invocation) {
                return;
            }
            const node = mapResponseToNode(chatModel, this.props.parentNode);
            this.setState({ node });

            this.toDispose.push(chatModel.onDidChange(() => this.forceUpdate()));
            // Pending interactions are derived from chatModel.pendingInteractions in
            // render(); interactionNeeded does not imply onDidChange, so re-render
            // explicitly when a new interaction is announced (#17952).
            this.toDispose.push(chatModel.onInteractionNeeded(() => this.forceUpdate()));
        }).catch(error => {
            console.error('Failed to create delegated chat response:', error);
        });

        invocation.responseCompleted.then(() => {
            if (!this.unmounted) {
                this.forceUpdate();
            }
        }).catch(error => {
            console.error('Error in delegated chat response completion:', error);
            if (!this.unmounted) {
                this.forceUpdate();
            }
        });
    }

    override componentWillUnmount(): void {
        this.unmounted = true;
        this.toDispose.dispose();
    }

    /**
     * The highest-priority renderer that implements renderConfirmation. Unlike plain
     * rendering, this must not stop at the overall highest-priority renderer: a
     * specialized renderer without renderConfirmation (e.g. the delegation renderer
     * itself for nested delegations) would otherwise silently drop the interaction.
     */
    private findConfirmationRenderer(contentPart: ChatResponseContent): ChatResponsePartRenderer<ChatResponseContent> | undefined {
        return this.props.chatResponsePartRenderers.getContributions()
            .filter(renderer => renderer.renderConfirmation)
            .reduce<[number, ChatResponsePartRenderer<ChatResponseContent> | undefined]>(
                (prev, current) => {
                    const prio = current.canHandle(contentPart);
                    if (prio > prev[0]) {
                        return [prio, current];
                    }
                    return prev;
                },
                [-1, undefined])[1];
    }

    private handleToggle = (event: React.SyntheticEvent<HTMLDetailsElement>): void => {
        const details = event.currentTarget;
        this.setState({ isOpen: details.open });
    };

    /**
     * Clicking anywhere inside a <summary> toggles the <details> element by default,
     * which would collapse/expand the block while the user operates the inline
     * interaction UI. Suppress the toggle for such clicks — but keep nested
     * <summary> elements working (e.g. the argument expanders of a confirmation
     * card), whose own toggle is also the click's default action.
     */
    private preventSummaryToggle = (event: React.MouseEvent): void => {
        const target = event.target instanceof HTMLElement ? event.target : undefined;
        const closestSummary = target?.closest('summary');
        if (closestSummary && event.currentTarget.contains(closestSummary)) {
            return;
        }
        event.preventDefault();
    };

    private renderPendingInteractions(pendingInteractions: ReadonlyArray<InteractiveContent & ChatResponseContent>): React.ReactNode[] {
        // Key by interactionId so a sibling interaction resolving does not remount the
        // remaining ones (losing in-progress wizard state); disambiguate the rare
        // duplicate ids (e.g. two pending questions with identical text) by occurrence.
        const seenIds = new Map<string, number>();
        return pendingInteractions.map(contentPart => {
            const baseKey = contentPart.interactionId ?? 'interaction';
            const occurrence = seenIds.get(baseKey) ?? 0;
            seenIds.set(baseKey, occurrence + 1);
            return this.renderInteractionConfirmation(contentPart, occurrence === 0 ? baseKey : `${baseKey}-${occurrence}`);
        });
    }

    private renderInteractionConfirmation(contentPart: InteractiveContent & ChatResponseContent, key: string): React.ReactNode {
        const renderer = this.findConfirmationRenderer(contentPart);
        if (renderer && this.state.node) {
            return (
                <React.Fragment key={key}>
                    {renderer.renderConfirmation!(contentPart, this.state.node)}
                </React.Fragment>
            );
        }
        return undefined;
    }

    override render(): React.ReactNode {
        const { agentName, prompt } = this.props;
        const hasNode = !!this.state.node;
        const isComplete = this.state.node?.response.isComplete ?? false;
        const isCanceled = this.state.node?.response.isCanceled ?? false;
        const isError = this.state.node?.response.isError ?? false;
        // Derived from the model on every render so pending interactions survive
        // remounts and never outlive their resolution or the response (#17952). The
        // list also covers interactions bubbled up from nested delegations, whose
        // waiting state is not reflected in this response's isWaitingForInput.
        const pendingInteractions = this.state.node?.response.pendingInteractions ?? [];
        const isWaitingForInput = (this.state.node?.response.isWaitingForInput ?? false) || pendingInteractions.length > 0;

        let statusIcon = '';
        let statusText = '';
        if (hasNode) {
            if (isCanceled) {
                statusIcon = 'codicon-close';
                statusText = nls.localize('theia/ai/chat-ui/delegation-response-renderer/status/canceled', 'canceled');
            } else if (isError) {
                // error() also marks the response complete, so check isError first
                statusIcon = 'codicon-error';
                statusText = nls.localizeByDefault('error');
            } else if (isComplete) {
                statusIcon = 'codicon-check';
                statusText = nls.localizeByDefault('completed');
            } else if (isWaitingForInput) {
                statusIcon = 'codicon-loading';
                statusText = nls.localize('theia/ai/chat-ui/delegation-response-renderer/status/waitingForInput', 'waiting for input');
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

        const { isOpen } = this.state;
        const showInteractionsInSummary = !isOpen && pendingInteractions.length > 0;

        return (
            <div className='theia-delegation-container'>
                <details className='delegation-response-details' onToggle={this.handleToggle}>
                    <summary className='delegation-summary'>
                        <div className='delegation-header'>
                            <span className='delegation-agent'>
                                <span className='codicon codicon-copilot-large' /> {agentName}
                            </span>
                            <span className='delegation-status'>
                                {showInteractionsInSummary && (
                                    <span className='delegation-interaction-badge' title={nls.localize(
                                        'theia/ai/chat-ui/delegation-response-renderer/interactionNeeded',
                                        'User interaction needed'
                                    )}>
                                        <span className='codicon codicon-warning'></span>
                                    </span>
                                )}
                                <span className={`codicon ${statusIcon} delegation-status-icon`}></span>
                                <span className='delegation-status-text'>{statusText}</span>
                            </span>
                            <span className={`delegation-toggle-arrow${isOpen ? ' open' : ''}`} />
                        </div>
                        {showInteractionsInSummary && (
                            <div className='delegation-pending-confirmations' onClick={this.preventSummaryToggle}>
                                {this.renderPendingInteractions(pendingInteractions)}
                            </div>
                        )}
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

const DelegatedChatWithConfirmation = withToolCallConfirmation(DelegatedChat);

function mapResponseToNode(response: ChatResponseModel, parentNode: ResponseNode): ResponseNode {
    return {
        id: response.id,
        parent: parentNode as unknown as CompositeTreeNode,
        response,
        sessionId: parentNode.sessionId
    };
}
