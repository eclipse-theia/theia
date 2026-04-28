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
    UserInteractionStep,
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
    openerService: OpenerService;
}

interface StepState {
    value?: string;
    comments: string[];
}

const UserInteractionComponent: React.FC<UserInteractionComponentProps> = ({
    args, toolCallId, tool, finished, openerService
}) => {
    const steps = args.interactions;
    const stepCount = steps.length;
    const [currentStep, setCurrentStep] = React.useState(0);
    const [stepStates, setStepStates] = React.useState<StepState[]>(() => steps.map(() => ({ comments: [] })));
    const [pendingComment, setPendingComment] = React.useState('');

    const activeStep: UserInteractionStep | undefined = steps[currentStep];
    const isLastStep = currentStep === stepCount - 1;
    const messageRef = useMarkdownRendering(activeStep?.message ?? '', openerService);

    // Auto-open the active step's links the first time the user reaches it.
    // Going Back and then Forward must not re-open them.
    const visitedStepsRef = React.useRef<Set<number>>(new Set());
    React.useEffect(() => {
        if (finished || !activeStep || visitedStepsRef.current.has(currentStep)) {
            return;
        }
        visitedStepsRef.current.add(currentStep);
        const links = activeStep.links ?? [];
        for (const link of links) {
            if (link.autoOpen !== false) {
                tool.openLink(link).catch(() => { /* best-effort */ });
            }
        }
    }, [currentStep, activeStep, finished, tool]);

    const persistStepState = React.useCallback((stepIndex: number, state: StepState) => {
        tool.setStepResult(toolCallId, stepIndex, {
            value: state.value,
            comments: state.comments.length > 0 ? state.comments : undefined
        });
    }, [tool, toolCallId]);

    const updateStepState = React.useCallback((stepIndex: number, updater: (prev: StepState) => StepState) => {
        setStepStates(prev => {
            const next = prev.slice();
            const updated = updater(prev[stepIndex]);
            next[stepIndex] = updated;
            persistStepState(stepIndex, updated);
            return next;
        });
    }, [persistStepState]);

    const isSingleStep = stepCount === 1;

    const handleOptionClick = React.useCallback((value: string) => {
        if (finished) {
            return;
        }
        if (isSingleStep) {
            updateStepState(0, prev => ({ ...prev, value }));
            tool.completeInteraction(toolCallId);
            return;
        }
        updateStepState(currentStep, prev => ({
            ...prev,
            value: prev.value === value ? undefined : value
        }));
    }, [currentStep, finished, isSingleStep, tool, toolCallId, updateStepState]);

    const handleAddComment = React.useCallback(() => {
        const trimmed = pendingComment.trim();
        if (finished || !trimmed) {
            return;
        }
        updateStepState(currentStep, prev => ({
            ...prev,
            comments: [...prev.comments, trimmed]
        }));
        setPendingComment('');
    }, [currentStep, finished, pendingComment, updateStepState]);

    const handleRemoveComment = React.useCallback((commentIndex: number) => {
        if (finished) {
            return;
        }
        updateStepState(currentStep, prev => ({
            ...prev,
            comments: prev.comments.filter((_, i) => i !== commentIndex)
        }));
    }, [currentStep, finished, updateStepState]);

    const handleCommentKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddComment();
        }
    }, [handleAddComment]);

    const handleAdvance = React.useCallback(() => {
        if (isLastStep) {
            if (!finished) {
                tool.completeInteraction(toolCallId);
            }
            return;
        }
        setCurrentStep(idx => idx + 1);
        setPendingComment('');
    }, [finished, isLastStep, tool, toolCallId]);

    const handleBack = React.useCallback(() => {
        if (currentStep === 0) {
            return;
        }
        setCurrentStep(idx => idx - 1);
        setPendingComment('');
    }, [currentStep]);

    if (!activeStep) {
        return undefined;
    }

    const activeState = stepStates[currentStep];
    const stepLabel = nls.localize('theia/ai-ide/userInteractionStepLabel', 'Step {0} of {1}', currentStep + 1, stepCount);
    const advanceLabel = isLastStep
        ? nls.localize('theia/ai-ide/userInteractionFinishStep', 'Finish')
        : nls.localizeByDefault('Next');

    const hasOptions = !!activeStep.options && activeStep.options.length > 0;
    const showAdvanceRow = !isSingleStep || (isSingleStep && !hasOptions);

    return (
        <div className='tool-call container user-interaction-wizard'>
            <div className='tool-call header'>
                <span className={codicon('comment-discussion')} />
                <span className='user-interaction-tool title'>{activeStep.title}</span>
            </div>
            {!isSingleStep && <StepProgress current={currentStep} total={stepCount} />}
            {activeStep.links && activeStep.links.length > 0 && (
                <div className='user-interaction-tool links'>
                    {activeStep.links.map((link, i) => (
                        <LinkButton key={i} link={link} onClick={() => tool.openLink(link)} />
                    ))}
                </div>
            )}
            <div className='user-interaction-tool message' ref={messageRef} />
            {hasOptions && (
                <div className='user-interaction-tool options'>
                    {activeStep.options!.map((option, i) => {
                        const isSelected = activeState.value === option.value;
                        const className = 'user-interaction-tool option-button theia-button '
                            + (isSelected ? 'main selected' : 'secondary');
                        return (
                            <button
                                key={i}
                                className={className}
                                onClick={() => handleOptionClick(option.value)}
                                disabled={finished}
                                title={option.description}
                                aria-pressed={isSelected}
                            >
                                {isSelected && <i className={`${codicon('check')} user-interaction-tool option-selected-icon`} />}
                                {option.buttonLabel || option.text}
                            </button>
                        );
                    })}
                </div>
            )}
            {!isSingleStep && (
                <div className='user-interaction-tool comment-section'>
                    {!finished && (
                        <div className='user-interaction-tool comment-input-row'>
                            <input
                                type='text'
                                className='theia-input user-interaction-tool comment-input-field'
                                placeholder={nls.localize('theia/ai-ide/userInteractionCommentPlaceholder', 'Add a comment...')}
                                value={pendingComment}
                                onChange={e => setPendingComment(e.target.value)}
                                onKeyDown={handleCommentKeyDown}
                            />
                            <button
                                className='theia-button secondary user-interaction-tool comment-submit'
                                onClick={handleAddComment}
                                disabled={!pendingComment.trim()}
                            >
                                {nls.localizeByDefault('Comment')}
                            </button>
                        </div>
                    )}
                    {activeState.comments.length > 0 && (
                        <ul className='user-interaction-tool comment-list'>
                            {activeState.comments.map((comment, i) => (
                                <li key={i} className='user-interaction-tool comment-item'>
                                    <span className='user-interaction-tool comment-text'>{comment}</span>
                                    {!finished && (
                                        <button
                                            className='user-interaction-tool comment-remove'
                                            onClick={() => handleRemoveComment(i)}
                                            title={nls.localizeByDefault('Remove')}
                                            aria-label={nls.localizeByDefault('Remove')}
                                        >
                                            <i className={codicon('close')} />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {showAdvanceRow && (
                <div className='user-interaction-tool advance-row'>
                    {!isSingleStep && (
                        <>
                            <button
                                className='theia-button secondary user-interaction-tool back-button'
                                onClick={handleBack}
                                disabled={currentStep === 0}
                                title={nls.localizeByDefault('Back')}
                            >
                                <i className={codicon('arrow-left')} />
                                {nls.localizeByDefault('Back')}
                            </button>
                            <span className='user-interaction-tool page-counter' aria-label={stepLabel}>
                                {currentStep + 1} / {stepCount}
                            </span>
                        </>
                    )}
                    <button
                        className='theia-button main user-interaction-tool advance-button'
                        onClick={handleAdvance}
                        disabled={finished && isLastStep}
                    >
                        {advanceLabel}
                        <i className={codicon(isLastStep ? 'check' : 'arrow-right')} />
                    </button>
                </div>
            )}
        </div>
    );
};

const StepProgress: React.FC<{ current: number; total: number }> = ({ current, total }) => (
    <div className='user-interaction-tool progress'>
        {Array.from({ length: total }).map((_, i) => (
            <span
                key={i}
                className={'user-interaction-tool progress-dot'
                    + (i < current ? ' done' : '')
                    + (i === current ? ' active' : '')}
            />
        ))}
    </div>
);

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

const StreamingProgress: React.FC<{ title: string; stepCount: number }> = ({ title, stepCount }) => {
    let label: string;
    if (title && stepCount > 0) {
        label = nls.localize('theia/ai-ide/userInteractionPreparingSteps', 'Preparing: {0} ({1} steps)', title, stepCount);
    } else if (title) {
        label = nls.localize('theia/ai-ide/userInteractionPreparingTitle', 'Preparing: {0}', title);
    } else {
        label = nls.localize('theia/ai-ide/userInteractionPreparing', 'Preparing user interaction...');
    }
    return (
        <div className='tool-call container'>
            <div className='tool-call header pending'>
                <span className={codicon('comment-discussion')} />
                <span className={`${codicon('loading')} theia-animation-spin`} />
                <span className='user-interaction-tool pending-text'>{label}</span>
            </div>
        </div>
    );
};

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
            return <StreamingProgress title={input.title} stepCount={input.stepCount} />;
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
