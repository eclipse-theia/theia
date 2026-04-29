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
    UserInteractionArgs,
    UserInteractionLink,
    UserInteractionResult,
    UserInteractionStep,
    buildDiffLabel,
    isEmptyContentRef,
    parseUserInteractionArgs,
    parseUserInteractionInput,
    parseUserInteractionResult,
    resolveContentRef,
} from '../common/user-interaction-tool';

interface UserInteractionComponentProps {
    args: UserInteractionArgs;
    toolCallId: string;
    tool: UserInteractionTool;
    finished: boolean;
    canceled: boolean;
    /**
     * Whether the parent response has completed (including restoration). When the
     * response is complete but no `result` was persisted, the interaction is treated
     * as canceled because there is no longer a live agent waiting for input.
     */
    responseComplete: boolean;
    result: UserInteractionResult | undefined;
    openerService: OpenerService;
}

interface StepState {
    value?: string;
    comments: string[];
}

const UserInteractionComponent: React.FC<UserInteractionComponentProps> = ({
    args, toolCallId, tool, finished, canceled, responseComplete, result, openerService
}) => {
    const steps = args.interactions;
    const stepCount = steps.length;
    const [currentStep, setCurrentStep] = React.useState(0);
    const [stepStates, setStepStates] = React.useState<StepState[]>(() => steps.map(() => ({ comments: [] })));
    const [pendingComment, setPendingComment] = React.useState('');

    const activeStep: UserInteractionStep | undefined = steps[currentStep];
    const isLastStep = currentStep === stepCount - 1;
    const messageRef = useMarkdownRendering(activeStep?.message ?? '', openerService);

    // A parent response that completed without delivering a tool result means the
    // interaction was restored from a serialized "waiting for input" state. The
    // agent that was waiting is no longer running, so it must be treated as
    // canceled and all inputs locked.
    const restoredWithoutResult = responseComplete && !result;
    const isFinal = finished || !!result || canceled || restoredWithoutResult;

    // Auto-open the active step's links the first time the user reaches it.
    // Going Back and then Forward must not re-open them.
    const visitedStepsRef = React.useRef<Set<number>>(new Set());
    React.useEffect(() => {
        if (isFinal || !activeStep || visitedStepsRef.current.has(currentStep)) {
            return;
        }
        visitedStepsRef.current.add(currentStep);
        const links = activeStep.links ?? [];
        for (const link of links) {
            if (link.autoOpen !== false) {
                tool.openLink(link).catch(err => console.warn('Failed to auto-open user-interaction link:', err));
            }
        }
    }, [currentStep, activeStep, isFinal, tool]);

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
    const hasOptions = !!activeStep?.options && activeStep.options.length > 0;

    const handleOptionClick = React.useCallback((value: string) => {
        if (isFinal) {
            return;
        }
        if (isSingleStep) {
            setStepStates(prev => {
                const next = prev.slice();
                next[0] = { ...prev[0], value };
                return next;
            });
            tool.completeInteractionWith(toolCallId, 0, { value });
            return;
        }
        updateStepState(currentStep, prev => ({
            ...prev,
            value: prev.value === value ? undefined : value
        }));
    }, [currentStep, isFinal, isSingleStep, tool, toolCallId, updateStepState]);

    const handleAddComment = React.useCallback(() => {
        const trimmed = pendingComment.trim();
        if (isFinal || !trimmed) {
            return;
        }
        updateStepState(currentStep, prev => ({
            ...prev,
            comments: [...prev.comments, trimmed]
        }));
        setPendingComment('');
    }, [currentStep, isFinal, pendingComment, updateStepState]);

    const handleRemoveComment = React.useCallback((commentIndex: number) => {
        if (isFinal) {
            return;
        }
        updateStepState(currentStep, prev => ({
            ...prev,
            comments: prev.comments.filter((_, i) => i !== commentIndex)
        }));
    }, [currentStep, isFinal, updateStepState]);

    const handleCommentKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddComment();
        }
    }, [handleAddComment]);

    const goToStep = React.useCallback((idx: number) => {
        if (idx < 0 || idx >= stepCount) {
            return;
        }
        setCurrentStep(idx);
        setPendingComment('');
    }, [stepCount]);

    const handleAdvance = React.useCallback(() => {
        if (isLastStep) {
            if (!isFinal) {
                tool.completeInteraction(toolCallId);
            }
            return;
        }
        setCurrentStep(idx => idx + 1);
        setPendingComment('');
    }, [isFinal, isLastStep, tool, toolCallId]);

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

    const showAdvanceRow = !isSingleStep;

    return (
        <div className='tool-call container user-interaction-wizard'>
            <div className='tool-call header'>
                <span className={codicon('comment-discussion')} />
                <span className='user-interaction-tool title'>{activeStep.title}</span>
                {(() => {
                    // The tool's own result is authoritative: a completed
                    // interaction must stay "Completed" even if the chat
                    // session is canceled later. A response that completed
                    // without a result indicates the interaction was restored
                    // from a "waiting" state and is treated as canceled.
                    const status: 'completed' | 'canceled' | 'waiting' =
                        result?.completed === true ? 'completed' :
                        result?.completed === false || canceled || restoredWithoutResult ? 'canceled' :
                        'waiting';
                    if (status === 'completed') {
                        return (
                            <span className='user-interaction-tool status completed'>
                                <i className={codicon('check')} />
                                {nls.localizeByDefault('Completed')}
                            </span>
                        );
                    }
                    if (status === 'canceled') {
                        return (
                            <span className='user-interaction-tool status canceled'>
                                <i className={codicon('close')} />
                                {nls.localize('theia/ai-ide/userInteractionCanceled', 'Canceled')}
                            </span>
                        );
                    }
                    return (
                        <span className='user-interaction-tool status waiting' role='status' aria-live='polite'>
                            {nls.localize('theia/ai/chat-ui/chat-view-tree-widget/waitingForInput', 'Waiting for input')}
                        </span>
                    );
                })()}
            </div>
            {!isSingleStep && <StepProgress current={currentStep} total={stepCount} onSelect={goToStep} steps={steps} />}
            {activeStep.links && activeStep.links.length > 0 && (
                <div className='user-interaction-tool links'>
                    {activeStep.links.map((link, i) => (
                        <LinkButton
                            key={i}
                            link={link}
                            onClick={() => tool.openLink(link).catch(err => console.warn('Failed to open user-interaction link:', err))}
                        />
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
                                disabled={isFinal}
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
                    {!isFinal && (
                        <div className='user-interaction-tool comment-input-row'>
                            <input
                                type='text'
                                className='theia-input user-interaction-tool comment-input-field'
                                placeholder={nls.localize('theia/ai-ide/userInteractionCommentPlaceholder', 'Add a comment for this step...')}
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
                                    {!isFinal && (
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
                        disabled={isFinal && isLastStep}
                    >
                        {advanceLabel}
                        <i className={codicon(isLastStep ? 'check' : 'arrow-right')} />
                    </button>
                </div>
            )}
        </div>
    );
};

const StepProgress: React.FC<{
    current: number;
    total: number;
    onSelect: (index: number) => void;
    steps: UserInteractionStep[];
}> = ({ current, total, onSelect, steps }) => (
    <div className='user-interaction-tool progress'>
        {Array.from({ length: total }).map((_, i) => {
            const label = nls.localize(
                'theia/ai-ide/userInteractionGoToStep',
                'Go to step {0}: {1}',
                i + 1,
                steps[i]?.title ?? ''
            );
            return (
                <button
                    key={i}
                    type='button'
                    className={'user-interaction-tool progress-dot'
                        + (i < current ? ' done' : '')
                        + (i === current ? ' active' : '')}
                    onClick={() => onSelect(i)}
                    title={label}
                    aria-label={label}
                    aria-current={i === current ? 'step' : undefined}
                />
            );
        })}
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
        label = buildDiffLabel(left, resolveContentRef(link.rightRef!));
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
                canceled={parentNode.response.isCanceled}
                responseComplete={parentNode.response.isComplete}
                result={parseUserInteractionResult(response.result)}
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
