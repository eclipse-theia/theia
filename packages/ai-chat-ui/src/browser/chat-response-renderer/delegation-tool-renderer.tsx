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
import { AGENT_DELEGATION_FUNCTION_ID } from '@theia/ai-core/lib/common/tool-constants';
import { ToolInvocationRegistry } from '@theia/ai-core';
import { AgentDelegationTool } from '@theia/ai-chat/lib/browser/agent-delegation-tool';
import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { ResponseNode } from '../chat-tree-view';
import { SubChatWidgetFactory } from '../chat-tree-view/sub-chat-widget';
import { withToolCallConfirmation } from './tool-confirmation';
import { extractJsonStringField } from './toolcall-utils';
import { CompositeTreeNode, ContextMenuRenderer } from '@theia/core/lib/browser';
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
            response={response}
            confirmationMode={confirmationMode}
            toolConfirmationManager={this.toolConfirmationManager}
            toolRequest={toolRequest}
            chatId={chatId}
            requestCanceled={parentNode.response.isCanceled}
        />;
    }
}

interface PendingInteraction {
    contentPart: InteractiveContent & ChatResponseContent;
    id: string;
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
    pendingInteractions: PendingInteraction[];
}

class DelegatedChat extends React.Component<DelegatedChatProps, DelegatedChatState> {
    private widget: ReturnType<SubChatWidgetFactory>;
    private toDispose = new DisposableCollection();
    private trackedInteractionIds = new Set<string>();

    constructor(props: DelegatedChatProps) {
        super(props);
        this.state = {
            node: undefined,
            isOpen: false,
            pendingInteractions: []
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
        this.trackedInteractionIds.clear();
        if (!invocation) {
            return;
        }

        invocation.responseCreated.then(chatModel => {
            const node = mapResponseToNode(chatModel, this.props.parentNode);
            this.setState({ node });

            const changeListener = () => {
                this.removeResolvedInteractions();
                this.forceUpdate();
            };
            this.toDispose.push(chatModel.onDidChange(changeListener));

            // Subscribe to interactionNeeded for push-based interaction tracking
            this.toDispose.push(chatModel.onInteractionNeeded(contentPart => {
                const id = contentPart.interactionId;
                if (id && !this.trackedInteractionIds.has(id)
                    && this.findConfirmationRenderer(contentPart)) {
                    this.trackedInteractionIds.add(id);
                    this.setState(prevState => ({
                        pendingInteractions: [
                            ...prevState.pendingInteractions,
                            { contentPart, id }
                        ]
                    }));
                }
            }));
        }).catch(error => {
            console.error('Failed to create delegated chat response:', error);
        });

        invocation.responseCompleted.then(() => {
            this.forceUpdate();
        }).catch(error => {
            console.error('Error in delegated chat response completion:', error);
            this.forceUpdate();
        });
    }

    override componentWillUnmount(): void {
        this.toDispose.dispose();
        this.trackedInteractionIds.clear();
    }

    private removeResolvedInteractions(): void {
        this.setState(prevState => ({
            pendingInteractions: prevState.pendingInteractions.filter(p => !p.contentPart.isResolved)
        }));
    }

    private findConfirmationRenderer(contentPart: ChatResponseContent): ChatResponsePartRenderer<ChatResponseContent> | undefined {
        const renderer = this.props.chatResponsePartRenderers.getContributions().reduce<[number, ChatResponsePartRenderer<ChatResponseContent> | undefined]>(
            (prev, current) => {
                const prio = current.canHandle(contentPart);
                if (prio > prev[0]) {
                    return [prio, current];
                }
                return prev;
            },
            [-1, undefined])[1];
        if (renderer && renderer.renderConfirmation) {
            return renderer;
        }
        return undefined;
    }

    private handleToggle = (event: React.SyntheticEvent<HTMLDetailsElement>): void => {
        const details = event.currentTarget;
        this.setState({ isOpen: details.open });
    };

    private renderInteractionConfirmation(contentPart: ChatResponseContent, id: string): React.ReactNode {
        const renderer = this.findConfirmationRenderer(contentPart);
        if (renderer && this.state.node) {
            return <React.Fragment key={id}>{renderer.renderConfirmation!(contentPart, this.state.node)}</React.Fragment>;
        }
        return undefined;
    }

    override render(): React.ReactNode {
        const { agentName, prompt } = this.props;
        const hasNode = !!this.state.node;
        const isComplete = this.state.node?.response.isComplete ?? false;
        const isCanceled = this.state.node?.response.isCanceled ?? false;
        const isError = this.state.node?.response.isError ?? false;

        let statusIcon = '';
        let statusText = '';
        if (hasNode) {
            if (isCanceled) {
                statusIcon = 'codicon-close';
                statusText = nls.localize('theia/ai/chat-ui/delegation-response-renderer/status/canceled', 'canceled');
            } else if (isComplete) {
                statusIcon = 'codicon-check';
                statusText = nls.localizeByDefault('completed');
            } else if (isError) {
                statusIcon = 'codicon-error';
                statusText = nls.localize('theia/ai/chat-ui/delegation-response-renderer/status/error', 'error');
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

        const { isOpen, pendingInteractions } = this.state;
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
                            <div className='delegation-pending-confirmations'>
                                {pendingInteractions.map(({ contentPart, id }) =>
                                    this.renderInteractionConfirmation(contentPart, id)
                                )}
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
