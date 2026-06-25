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

import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatResponseContent, ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';
import { codicon, ContextMenuRenderer, HoverService, KeybindingRegistry, MarkdownRenderer, OpenerService } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { createConfirmationHandlers, ToolConfirmation, ToolConfirmationKeybindingHints, useToolConfirmationState } from './tool-confirmation';
import { ToolConfirmationMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { ResponseNode } from '../chat-tree-view';
import { ToolInvocationRegistry, ToolRequest } from '@theia/ai-core';
import { renderToolCallResult } from './toolcall-result';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import { PendingToolConfirmationTracker } from '@theia/ai-chat/lib/browser/pending-tool-confirmation-tracker';
import {
    APPROVE_LATEST_TOOL_CONFIRMATION_COMMAND,
    DENY_LATEST_TOOL_CONFIRMATION_COMMAND
} from '../tool-confirmation-keybinding-contribution';
import { condenseArguments, formatArgsForTooltip } from './toolcall-utils';

@injectable()
export class ToolCallPartRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(ToolConfirmationManager)
    protected toolConfirmationManager: ToolConfirmationManager;

    @inject(OpenerService)
    protected openerService: OpenerService;

    @inject(ToolInvocationRegistry)
    protected toolInvocationRegistry: ToolInvocationRegistry;

    @inject(HoverService)
    protected hoverService: HoverService;

    @inject(ContextMenuRenderer)
    protected contextMenuRenderer: ContextMenuRenderer;

    @inject(PendingToolConfirmationTracker)
    protected pendingToolConfirmationTracker: PendingToolConfirmationTracker;

    @inject(KeybindingRegistry)
    protected keybindingRegistry: KeybindingRegistry;

    @inject(MarkdownRenderer)
    protected markdownRenderer: MarkdownRenderer;

    canHandle(response: ChatResponseContent): number {
        if (ToolCallChatResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }

    renderConfirmation(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        const chatId = parentNode.sessionId;
        const toolRequest = response.name ? this.toolInvocationRegistry.getFunction(response.name) : undefined;
        const { handleAllow, handleDeny } = createConfirmationHandlers(
            response.name, response, this.toolConfirmationManager, chatId, toolRequest
        );

        return <ToolConfirmation
            response={response}
            toolRequest={toolRequest}
            onAllow={handleAllow}
            onDeny={handleDeny}
            contextMenuRenderer={this.contextMenuRenderer}
            openerService={this.openerService}
            pendingTracker={this.pendingToolConfirmationTracker}
            keybindingHints={this.getKeybindingHints()}
            chatId={chatId}
            markdownRenderer={this.markdownRenderer}
        />;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        const chatId = parentNode.sessionId;
        const toolRequest = response.name ? this.toolInvocationRegistry.getFunction(response.name) : undefined;
        const confirmationMode = response.name ? this.getToolConfirmationSettings(response.name, chatId, toolRequest) : ToolConfirmationMode.DISABLED;
        return <ToolCallContent
            response={response}
            confirmationMode={confirmationMode}
            toolConfirmationManager={this.toolConfirmationManager}
            toolRequest={toolRequest}
            chatId={chatId}
            getArgumentsLabel={this.getArgumentsLabel.bind(this)}
            showArgsTooltip={this.showArgsTooltip.bind(this)}
            responseRenderer={this.renderResult.bind(this)}
            requestCanceled={parentNode.response.isCanceled}
            contextMenuRenderer={this.contextMenuRenderer}
            openerService={this.openerService}
            pendingTracker={this.pendingToolConfirmationTracker}
            keybindingHints={this.getKeybindingHints()}
            markdownRenderer={this.markdownRenderer} />;
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

    protected renderResult(response: ToolCallChatResponseContent): ReactNode {
        return renderToolCallResult(response.result, this.openerService);
    }

    protected getToolConfirmationSettings(responseId: string, chatId: string, toolRequest?: ToolRequest): ToolConfirmationMode {
        return this.toolConfirmationManager.getConfirmationMode(responseId, chatId, toolRequest);
    }

    protected getArgumentsLabel(toolName: string | undefined, args: string | undefined): string {
        if (!args || !args.trim() || args.trim() === '{}') {
            return '';
        }
        try {
            const toolRequest = toolName ? this.toolInvocationRegistry.getFunction(toolName) : undefined;
            if (toolRequest?.getArgumentsShortLabel) {
                const result = toolRequest.getArgumentsShortLabel(args);
                if (result) {
                    return result.hasMore ? `${result.label} \u2026` : result.label;
                }
            }
        } catch {
            // tool not found in registry, fall through to generic condensed rendering
        }
        return condenseArguments(args) ?? '\u2026';
    }

    protected showArgsTooltip(response: ToolCallChatResponseContent, target: HTMLElement | undefined): void {
        if (!target || !response.arguments || !response.arguments.trim() || response.arguments.trim() === '{}') {
            return;
        }
        const markdownString = formatArgsForTooltip(response.arguments);
        this.hoverService.requestHover({
            content: markdownString,
            target,
            position: 'right',
            interactive: true,
            cssClasses: ['toolcall-args-hover']
        });
    }
}

const Spinner = () => (
    <span className={`${codicon('loading')} theia-animation-spin`}></span>
);

interface ToolCallContentProps {
    response: ToolCallChatResponseContent;
    confirmationMode: ToolConfirmationMode;
    toolConfirmationManager: ToolConfirmationManager;
    toolRequest?: ToolRequest;
    chatId: string;
    getArgumentsLabel: (toolName: string | undefined, args: string | undefined) => string;
    showArgsTooltip: (response: ToolCallChatResponseContent, target: HTMLElement | undefined) => void;
    responseRenderer: (response: ToolCallChatResponseContent) => ReactNode | undefined;
    requestCanceled: boolean;
    contextMenuRenderer: ContextMenuRenderer;
    openerService: OpenerService;
    pendingTracker?: PendingToolConfirmationTracker;
    keybindingHints?: ToolConfirmationKeybindingHints;
    markdownRenderer?: MarkdownRenderer;
}

/**
 * A function component to handle tool call rendering and confirmation
 */
const ToolCallContent: React.FC<ToolCallContentProps> = ({
    response,
    confirmationMode,
    toolConfirmationManager,
    toolRequest,
    chatId,
    responseRenderer,
    getArgumentsLabel,
    requestCanceled,
    showArgsTooltip,
    contextMenuRenderer,
    openerService,
    pendingTracker,
    keybindingHints,
    markdownRenderer
}) => {
    const { confirmationState, rejectionReason } = useToolConfirmationState(response, confirmationMode);
    const summaryRef = React.useRef<HTMLElement | undefined>(undefined);
    const pendingRef = React.useRef<HTMLElement | undefined>(undefined);
    const allowedRef = React.useRef<HTMLElement | undefined>(undefined);

    const argsLabel = getArgumentsLabel(response.name, response.arguments);

    const formatReason = (reason: unknown): string => {
        if (!reason) {
            return '';
        }
        if (reason instanceof Error) {
            return reason.message;
        }
        if (typeof reason === 'string') {
            return reason;
        }
        try {
            return JSON.stringify(reason);
        } catch (e) {
            return String(reason);
        }
    };

    const { handleAllow, handleDeny } = React.useMemo(
        () => createConfirmationHandlers(response.name, response, toolConfirmationManager, chatId, toolRequest),
        [response, toolConfirmationManager, chatId, toolRequest]
    );

    const reasonText = formatReason(rejectionReason);

    return (
        <div className='theia-toolCall'>
            {confirmationState === 'rejected' ? (
                <span className='theia-toolCall-rejected'>
                    <span className={codicon('error')}></span> {nls.localize('theia/ai/chat-ui/toolcall-part-renderer/rejected', 'Execution canceled')}: {response.name}
                    {reasonText ? <span> — {reasonText}</span> : undefined}
                </span>
            ) : requestCanceled && !response.finished ? (
                <span className='theia-toolCall-rejected'>
                    <span className={codicon('error')}></span> {nls.localize('theia/ai/chat-ui/toolcall-part-renderer/rejected', 'Execution canceled')}: {response.name}
                </span>
            ) : confirmationState === 'denied' ? (
                <span className='theia-toolCall-denied'>
                    <span className={codicon('error')}></span> {nls.localize('theia/ai/chat-ui/toolcall-part-renderer/denied', 'Execution denied')}: {response.name}
                    {ToolCallChatResponseContent.isDenialResult(response.result) && response.result.reason ? <span> — {response.result.reason}</span> : undefined}
                </span>
            ) : response.finished ? (
                <details className='theia-toolCall-finished'>
                    <summary
                        ref={(el: HTMLElement | null) => { summaryRef.current = el ?? undefined; }}
                        onMouseEnter={() => showArgsTooltip(response, summaryRef.current)}
                    >
                        {nls.localize('theia/ai/chat-ui/toolcall-part-renderer/finished', 'Ran')} {response.name}
                        (<span className='theia-toolCall-args-label'>{argsLabel}</span>)
                    </summary>
                    <div className='theia-toolCall-response-result'>
                        {responseRenderer(response)}
                    </div>
                </details>
            ) : confirmationState === 'pending' ? (
                <span className='theia-toolCall-pending'
                    ref={(el: HTMLElement | null) => { pendingRef.current = el ?? undefined; }}
                    onMouseEnter={() => showArgsTooltip(response, pendingRef.current)}
                >
                    <Spinner /> {response.name}
                    (<span className='theia-toolCall-args-label'>{argsLabel}</span>)
                </span>
            ) : (
                confirmationState === 'allowed' && !requestCanceled && (
                    <span className='theia-toolCall-allowed'
                        ref={(el: HTMLElement | null) => { allowedRef.current = el ?? undefined; }}
                        onMouseEnter={() => showArgsTooltip(response, allowedRef.current)}
                    >
                        <Spinner /> {nls.localizeByDefault('Running')} {response.name}
                        (<span className='theia-toolCall-args-label'>{argsLabel}</span>)
                    </span>
                )
            )}

            {confirmationState === 'waiting' && !requestCanceled && !response.finished && (
                <span className='theia-toolCall-waiting'>
                    <ToolConfirmation
                        response={response}
                        toolRequest={toolRequest}
                        onAllow={handleAllow}
                        onDeny={handleDeny}
                        contextMenuRenderer={contextMenuRenderer}
                        openerService={openerService}
                        pendingTracker={pendingTracker}
                        keybindingHints={keybindingHints}
                        chatId={chatId}
                        markdownRenderer={markdownRenderer}
                    />
                </span>
            )}
        </div>
    );
};
