// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { ResponseNode } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { ChatResponseContent, ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { ToolCallResult } from '@theia/ai-core/lib/common/language-model';
import { ReactNode } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';
import { codicon, ContextMenuRenderer, OpenerService } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { useMarkdownRendering } from '@theia/ai-chat-ui/lib/browser/chat-response-renderer/markdown-part-renderer';
import { withToolCallConfirmation } from '@theia/ai-chat-ui/lib/browser/chat-response-renderer/tool-confirmation';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import { ToolInvocationRegistry } from '@theia/ai-core';
import { UserInteractionTool } from './user-interaction-tool';
import {
    USER_INTERACTION_FUNCTION_ID,
    PathContentRef,
    UserInteractionArgs,
    UserInteractionLink,
    isEmptyContentRef,
    parseUserInteractionArgs,
    parseUserInteractionInput,
    resolveContentRef,
} from '../common/user-interaction-tool';

interface UserInteractionComponentProps {
    args: UserInteractionArgs;
    toolCallId: string;
    tool: UserInteractionTool;
    finished: boolean;
    result: ToolCallResult | undefined;
    openerService: OpenerService;
}

const UserInteractionComponent: React.FC<UserInteractionComponentProps> = ({
    args, toolCallId, tool, finished, result, openerService
}) => {
    const messageRef = useMarkdownRendering(args.message, openerService);

    const handleOptionClick = React.useCallback((value: string) => {
        if (!finished) {
            tool.resolveInteraction(toolCallId, value);
        }
    }, [tool, toolCallId, finished]);

    const selectedValue = typeof result === 'string' ? result : undefined;

    const [showCustomInput, setShowCustomInput] = React.useState(false);
    const [customInputText, setCustomInputText] = React.useState('');

    const handleSubmitCustomInput = React.useCallback(() => {
        if (!finished && customInputText.trim()) {
            tool.resolveInteraction(toolCallId, `[Custom input]: ${customInputText.trim()}`);
            setShowCustomInput(false);
            setCustomInputText('');
        }
    }, [tool, toolCallId, finished, customInputText]);

    const handleCancelCustomInput = React.useCallback(() => {
        setShowCustomInput(false);
        setCustomInputText('');
    }, []);

    const handleCustomInputKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmitCustomInput();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancelCustomInput();
        }
    }, [handleSubmitCustomInput, handleCancelCustomInput]);

    return (
        <div className='tool-call container'>
            <div className='tool-call header'>
                <span className={codicon('comment-discussion')} />
                <span className='user-interaction-tool title'>{args.title}</span>
            </div>
            {args.links && args.links.length > 0 && (
                <div className='user-interaction-tool links'>
                    {args.links.map((link, i) => (
                        <LinkButton key={i} link={link} onClick={() => tool.openLink(link)} />
                    ))}
                </div>
            )}
            <div className='user-interaction-tool message' ref={messageRef} />
            {showCustomInput ? (
                <div className='user-interaction-tool custom-input'>
                    <input
                        autoFocus
                        type='text'
                        className='theia-input user-interaction-tool custom-input-field'
                        placeholder={nls.localize('theia/ai-ide/customInputPlaceholder', 'Enter your response...')}
                        value={customInputText}
                        onChange={e => setCustomInputText(e.target.value)}
                        onKeyDown={handleCustomInputKeyDown}
                    />
                    <div className='user-interaction-tool custom-input-actions'>
                        <button className='theia-button secondary' onClick={handleCancelCustomInput}>
                            {nls.localizeByDefault('Cancel')}
                        </button>
                        <button className='theia-button main' onClick={handleSubmitCustomInput}>
                            {nls.localizeByDefault('Submit')}
                        </button>
                    </div>
                </div>
            ) : (
                <div className='user-interaction-tool options'>
                    {args.options.map((option, i) => (
                        <button
                            key={i}
                            className={`user-interaction-tool option-button theia-button${selectedValue === option.value ? ' selected' : ''}`}
                            onClick={() => handleOptionClick(option.value)}
                            disabled={finished}
                            title={option.description}
                        >
                            {option.buttonLabel || option.text}
                        </button>
                    ))}
                    {!finished && (
                        <button
                            className='user-interaction-tool option-button theia-button secondary'
                            onClick={() => setShowCustomInput(true)}
                        >
                            <i className={codicon('pencil')} />{' '}{nls.localize('theia/ai-ide/otherOption', 'Other...')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

const LinkButton: React.FC<{ link: UserInteractionLink; onClick: () => void }> = ({ link, onClick }) => {
    const isDiff = link.rightRef !== undefined;
    const icon = isDiff ? codicon('diff') : codicon('go-to-file');
    const left = resolveContentRef(link.ref);
    let label: string;
    if (link.label) {
        label = link.label;
    } else if (isDiff) {
        const right = resolveContentRef(link.rightRef!);
        const leftIsEmpty = isEmptyContentRef(left);
        const rightIsEmpty = isEmptyContentRef(right);

        if (leftIsEmpty && rightIsEmpty) {
            label = `${left.label || 'Empty'} ⟷ ${right.label || 'Empty'}`;
        } else if (leftIsEmpty) {
            const r = right as PathContentRef;
            const rightTag = r.gitRef ? r.gitRef.substring(0, 8) + '…' : 'Working Copy';
            label = `${r.path} (${left.label || 'Empty'} ⟷ ${rightTag})`;
        } else if (rightIsEmpty) {
            const l = left as PathContentRef;
            const leftTag = l.gitRef ? l.gitRef.substring(0, 8) + '…' : 'Working Copy';
            label = `${l.path} (${leftTag} ⟷ ${right.label || 'Empty'})`;
        } else {
            const l = left as PathContentRef;
            const r = right as PathContentRef;
            if (l.path === r.path) {
                const leftTag = l.gitRef ? l.gitRef.substring(0, 8) + '…' : 'Working Copy';
                const rightTag = r.gitRef ? r.gitRef.substring(0, 8) + '…' : 'Working Copy';
                label = `${l.path} (${leftTag} ⟷ ${rightTag})`;
            } else {
                label = `${l.path} ⟷ ${r.path}`;
            }
        }
    } else {
        label = isEmptyContentRef(left) ? (left.label || 'Empty') : left.path;
    }

    return (
        <button className='user-interaction-tool link-button' onClick={onClick}>
            <i className={icon} />
            <span>{label}</span>
        </button>
    );
};

const UserInteractionWithConfirmation = withToolCallConfirmation(UserInteractionComponent);

const StreamingProgress: React.FC<{ title: string }> = ({ title }) => (
    <div className='tool-call container'>
        <div className='tool-call header pending'>
            <span className={codicon('comment-discussion')} />
            <span className={`${codicon('loading')} theia-animation-spin`} />
            <span className='user-interaction-tool pending-text'>
                {title
                    ? `Preparing: ${title}`
                    : 'Preparing user interaction...'}
            </span>
        </div>
    </div>
);

@injectable()
export class UserInteractionToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(ToolConfirmationManager)
    protected toolConfirmationManager: ToolConfirmationManager;

    @inject(ContextMenuRenderer)
    protected contextMenuRenderer: ContextMenuRenderer;

    @inject(ToolInvocationRegistry)
    protected toolInvocationRegistry: ToolInvocationRegistry;

    @inject(UserInteractionTool)
    protected userInteractionTool: UserInteractionTool;

    @inject(OpenerService)
    protected openerService: OpenerService;

    canHandle(response: ChatResponseContent): number {
        if (ToolCallChatResponseContent.is(response) && response.name === USER_INTERACTION_FUNCTION_ID) {
            return 20;
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        const args = parseUserInteractionArgs(response.arguments);

        if (!args || !response.id) {
            const input = parseUserInteractionInput(response.arguments);
            return <StreamingProgress title={input.title} />;
        }

        const chatId = parentNode.sessionId;
        const toolRequest = this.toolInvocationRegistry.getFunction(USER_INTERACTION_FUNCTION_ID);
        const confirmationMode = this.toolConfirmationManager.getConfirmationMode(
            USER_INTERACTION_FUNCTION_ID, chatId, toolRequest
        );

        return (
            <UserInteractionWithConfirmation
                args={args}
                toolCallId={response.id}
                tool={this.userInteractionTool}
                finished={response.finished}
                result={response.result}
                openerService={this.openerService}
                response={response}
                confirmationMode={confirmationMode}
                toolConfirmationManager={this.toolConfirmationManager}
                toolRequest={toolRequest}
                chatId={chatId}
                requestCanceled={parentNode.response.isCanceled}
                contextMenuRenderer={this.contextMenuRenderer}
            />
        );
    }
}
