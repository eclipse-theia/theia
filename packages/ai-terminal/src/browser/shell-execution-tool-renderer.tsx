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

import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { ResponseNode } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { ToolConfirmationActions, ToolConfirmationMode } from '@theia/ai-chat-ui/lib/browser/chat-response-renderer/tool-confirmation';
import { ChatResponseContent, ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { ToolConfirmationMode as ToolConfirmationPreferenceMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import { ToolInvocationRegistry, ToolRequest } from '@theia/ai-core';
import { nls } from '@theia/core/lib/common/nls';
import { codicon } from '@theia/core/lib/browser';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import { ShellExecutionTool } from './shell-execution-tool';
import {
    SHELL_EXECUTION_FUNCTION_ID,
    ShellExecutionToolResult,
    ShellExecutionCanceledResult
} from '../common/shell-execution-server';
import { parseShellExecutionInput, ShellExecutionInput } from '../common/shell-execution-input-parser';

@injectable()
export class ShellExecutionToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(ToolConfirmationManager)
    protected toolConfirmationManager: ToolConfirmationManager;

    @inject(ToolInvocationRegistry)
    protected toolInvocationRegistry: ToolInvocationRegistry;

    @inject(ShellExecutionTool)
    protected shellExecutionTool: ShellExecutionTool;

    @inject(ClipboardService)
    protected clipboardService: ClipboardService;

    /**
     * Priority 20: Higher than default ToolCallPartRenderer (10) to handle
     * shell execution tool calls with a specialized UI.
     */
    canHandle(response: ChatResponseContent): number {
        if (ToolCallChatResponseContent.is(response) && response.name === SHELL_EXECUTION_FUNCTION_ID) {
            return 20;
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        const chatId = parentNode.sessionId;
        const toolRequest = this.toolInvocationRegistry.getFunction(SHELL_EXECUTION_FUNCTION_ID);
        const confirmationMode = this.toolConfirmationManager.getConfirmationMode(
            SHELL_EXECUTION_FUNCTION_ID, chatId, toolRequest
        );

        const input = parseShellExecutionInput(response.arguments);

        return (
            <ShellExecutionToolComponent
                response={response}
                input={input}
                confirmationMode={confirmationMode}
                toolConfirmationManager={this.toolConfirmationManager}
                shellExecutionTool={this.shellExecutionTool}
                clipboardService={this.clipboardService}
                toolRequest={toolRequest}
                chatId={chatId}
                requestCanceled={parentNode.response.isCanceled}
            />
        );
    }
}

interface ShellExecutionToolComponentProps {
    response: ToolCallChatResponseContent;
    input: ShellExecutionInput;
    confirmationMode: ToolConfirmationPreferenceMode;
    toolConfirmationManager: ToolConfirmationManager;
    shellExecutionTool: ShellExecutionTool;
    clipboardService: ClipboardService;
    toolRequest?: ToolRequest;
    chatId: string;
    requestCanceled: boolean;
}

type ConfirmationState = 'waiting' | 'allowed' | 'denied' | 'rejected';

const ShellExecutionToolComponent: React.FC<ShellExecutionToolComponentProps> = ({
    response,
    input,
    confirmationMode,
    toolConfirmationManager,
    shellExecutionTool,
    clipboardService,
    toolRequest,
    chatId,
    requestCanceled
}) => {
    const getInitialState = (): ConfirmationState => {
        if (confirmationMode === ToolConfirmationPreferenceMode.ALWAYS_ALLOW) {
            return 'allowed';
        }
        if (confirmationMode === ToolConfirmationPreferenceMode.DISABLED) {
            return 'denied';
        }
        if (response.finished) {
            return ToolCallChatResponseContent.isDenialResult(response.result) ? 'denied' : 'allowed';
        }
        return 'waiting';
    };

    const [confirmationState, setConfirmationState] = React.useState<ConfirmationState>(getInitialState);
    const [toolFinished, setToolFinished] = React.useState(response.finished);
    const [isCanceling, setIsCanceling] = React.useState(false);

    React.useEffect(() => {
        if (confirmationMode === ToolConfirmationPreferenceMode.ALWAYS_ALLOW) {
            response.confirm();
        } else if (confirmationMode === ToolConfirmationPreferenceMode.DISABLED) {
            response.deny();
        } else {
            response.confirmed
                .then(confirmed => {
                    setConfirmationState(confirmed ? 'allowed' : 'denied');
                })
                .catch(err => {
                    console.debug('Shell execution tool confirmation rejected:', err);
                    setConfirmationState('rejected');
                });
        }
    }, [response, confirmationMode]);

    React.useEffect(() => {
        if (toolFinished || response.finished) {
            setToolFinished(true);
            return;
        }

        let cancelled = false;
        response.whenFinished.then(() => {
            if (!cancelled) {
                setToolFinished(true);
            }
        });

        return () => { cancelled = true; };
    }, [toolFinished, response]);

    const handleCancel = React.useCallback(async () => {
        if (isCanceling || !response.id) {
            return;
        }
        setIsCanceling(true);
        try {
            await shellExecutionTool.cancelExecution(response.id);
        } catch (err) {
            console.debug('Failed to cancel shell execution:', err);
        }
        // Don't reset isCanceling - stay in canceling state until tool finishes
    }, [response.id, shellExecutionTool, isCanceling]);

    const handleAllow = React.useCallback((mode: ToolConfirmationMode) => {
        if (mode === 'forever') {
            toolConfirmationManager.setConfirmationMode(SHELL_EXECUTION_FUNCTION_ID, ToolConfirmationPreferenceMode.ALWAYS_ALLOW);
        } else if (mode === 'session') {
            toolConfirmationManager.setSessionConfirmationMode(SHELL_EXECUTION_FUNCTION_ID, ToolConfirmationPreferenceMode.ALWAYS_ALLOW, chatId);
        }
        response.confirm();
    }, [response, toolConfirmationManager, chatId]);

    const handleDeny = React.useCallback((mode: ToolConfirmationMode, reason?: string) => {
        if (mode === 'forever') {
            toolConfirmationManager.setConfirmationMode(SHELL_EXECUTION_FUNCTION_ID, ToolConfirmationPreferenceMode.DISABLED);
        } else if (mode === 'session') {
            toolConfirmationManager.setSessionConfirmationMode(SHELL_EXECUTION_FUNCTION_ID, ToolConfirmationPreferenceMode.DISABLED, chatId);
        }
        response.deny(reason);
    }, [response, toolConfirmationManager, chatId]);

    let result: ShellExecutionToolResult | undefined;
    let canceledResult: ShellExecutionCanceledResult | undefined;
    if (toolFinished && response.result) {
        try {
            const parsed = typeof response.result === 'string'
                ? JSON.parse(response.result)
                : response.result;
            if (ShellExecutionCanceledResult.is(parsed)) {
                canceledResult = parsed;
            } else if (ShellExecutionToolResult.is(parsed)) {
                result = parsed;
            }
        } catch (err) {
            console.debug('Failed to parse shell execution result:', err);
        }
    }

    if (!input.command && !toolFinished) {
        return (
            <div className="shell-execution-tool container">
                <div className="shell-execution-tool header running">
                    <span className={codicon('terminal')} />
                    <span className={`${codicon('loading')} theia-animation-spin`} />
                </div>
            </div>
        );
    }

    if (confirmationState === 'waiting' && !requestCanceled && !toolFinished) {
        return (
            <ConfirmationUI
                input={input}
                toolRequest={toolRequest}
                onAllow={handleAllow}
                onDeny={handleDeny}
            />
        );
    }

    if (confirmationState === 'denied' || confirmationState === 'rejected') {
        const denialResult = ToolCallChatResponseContent.isDenialResult(response.result) ? response.result : undefined;
        return (
            <DeniedUI
                input={input}
                confirmationState={confirmationState}
                denialReason={denialResult?.reason}
                clipboardService={clipboardService}
            />
        );
    }

    // Show canceling state when user clicked cancel on this command and it's still stopping
    if (!toolFinished && isCanceling && !requestCanceled) {
        return (
            <CancelingUI input={input} />
        );
    }

    if (!toolFinished && confirmationState === 'allowed' && !requestCanceled) {
        return (
            <RunningUI
                input={input}
                onCancel={handleCancel}
            />
        );
    }

    // Show canceled UI when tool was running and got canceled (has a canceled result with partial output)
    if (canceledResult) {
        return (
            <CanceledUI
                input={input}
                canceledResult={canceledResult}
                clipboardService={clipboardService}
            />
        );
    }

    return (
        <FinishedUI
            input={input}
            result={result}
            clipboardService={clipboardService}
        />
    );
};

interface ConfirmationUIProps {
    input: ShellExecutionInput;
    toolRequest?: ToolRequest;
    onAllow: (mode: ToolConfirmationMode) => void;
    onDeny: (mode: ToolConfirmationMode, reason?: string) => void;
}

const ConfirmationUI: React.FC<ConfirmationUIProps> = ({
    input,
    toolRequest,
    onAllow,
    onDeny
}) => (
    <div className="shell-execution-tool container">
        <div className="shell-execution-tool confirmation">
            <div className="shell-execution-tool confirmation-header">
                <span className={codicon('shield')} />
                <span className="shell-execution-tool confirmation-title">
                    {nls.localize('theia/ai-terminal/confirmExecution', 'Confirm Shell Command')}
                </span>
            </div>

            <div className="shell-execution-tool command-display confirmation">
                <code>{input.command}</code>
            </div>

            <div className="shell-execution-tool confirmation-meta">
                {input.cwd && (
                    <span
                        className="shell-execution-tool meta-item"
                        title={nls.localize('theia/ai-terminal/workingDirectory', 'Working directory')}
                    >
                        <span className={codicon('folder')} />
                        {input.cwd}
                    </span>
                )}
                {input.timeout && (
                    <span
                        className="shell-execution-tool meta-item"
                        title={nls.localize('theia/ai-terminal/timeout', 'Timeout')}
                    >
                        <span className={codicon('clock')} />
                        {formatDuration(input.timeout)}
                    </span>
                )}
            </div>

            <ToolConfirmationActions
                toolName={SHELL_EXECUTION_FUNCTION_ID}
                toolRequest={toolRequest}
                onAllow={onAllow}
                onDeny={onDeny}
            />
        </div>
    </div>
);

interface RunningUIProps {
    input: ShellExecutionInput;
    onCancel: () => void;
}

const RunningUI: React.FC<RunningUIProps> = ({
    input,
    onCancel
}) => (
    <div className="shell-execution-tool container">
        <div className="shell-execution-tool header running">
            <span className={codicon('terminal')} />
            <code className="shell-execution-tool command-preview">{truncateCommand(input.command)}</code>
            <span className="shell-execution-tool meta-badges">
                <button
                    className="shell-execution-tool cancel-button"
                    onClick={onCancel}
                    title={nls.localize('theia/ai-terminal/cancelExecution', 'Cancel command execution')}
                >
                    <span className={codicon('debug-stop')} />
                </button>
                <span className={`${codicon('loading')} shell-execution-tool status-icon theia-animation-spin`} />
            </span>
        </div>
    </div>
);

interface CancelingUIProps {
    input: ShellExecutionInput;
}

const CancelingUI: React.FC<CancelingUIProps> = ({ input }) => (
    <div className="shell-execution-tool container">
        <div className="shell-execution-tool header canceling">
            <span className={codicon('terminal')} />
            <code className="shell-execution-tool command-preview">{truncateCommand(input.command)}</code>
            <span className="shell-execution-tool meta-badges">
                <span className="shell-execution-tool status-label canceling">
                    <span className={`${codicon('loading')} theia-animation-spin`} />
                    {nls.localize('theia/ai-terminal/canceling', 'Canceling...')}
                </span>
            </span>
        </div>
    </div>
);

interface DeniedUIProps {
    input: ShellExecutionInput;
    confirmationState: 'denied' | 'rejected';
    denialReason?: string;
    clipboardService: ClipboardService;
}

const DeniedUI: React.FC<DeniedUIProps> = ({
    input,
    confirmationState,
    denialReason,
    clipboardService
}) => {
    const [isExpanded, setIsExpanded] = React.useState(false);

    const getStatusLabel = (): string => {
        if (confirmationState === 'rejected') {
            return nls.localize('theia/ai-terminal/executionCanceled', 'Canceled');
        }
        return denialReason
            ? nls.localize('theia/ai-terminal/executionDeniedWithReason', 'Denied with reason')
            : nls.localize('theia/ai-terminal/executionDenied', 'Denied');
    };

    return (
        <div className={`shell-execution-tool container ${isExpanded ? 'expanded' : ''}`}>
            <div
                className="shell-execution-tool header error"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className={codicon('terminal')} />
                <code className="shell-execution-tool command-preview">{truncateCommand(input.command)}</code>
                <span className="shell-execution-tool meta-badges">
                    <span className="shell-execution-tool status-label error">
                        {getStatusLabel()}
                    </span>
                </span>
            </div>
            {isExpanded && (
                <div className="shell-execution-tool expanded-content">
                    <CommandDisplay command={input.command} clipboardService={clipboardService} />
                    {input.cwd && (
                        <MetaRow icon="folder" label={nls.localize('theia/ai-terminal/workingDirectory', 'Working directory')}>
                            {input.cwd}
                        </MetaRow>
                    )}
                    {denialReason && (
                        <div className="shell-execution-tool denial-reason">
                            <div className="shell-execution-tool denial-reason-header">
                                <span className={codicon('comment')} />
                                {nls.localize('theia/ai-terminal/denialReason', 'Reason')}
                            </div>
                            <div className="shell-execution-tool denial-reason-content">
                                {denialReason}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

interface CanceledUIProps {
    input: ShellExecutionInput;
    canceledResult?: ShellExecutionCanceledResult;
    clipboardService: ClipboardService;
}

const CanceledUI: React.FC<CanceledUIProps> = ({
    input,
    canceledResult,
    clipboardService
}) => {
    const [isExpanded, setIsExpanded] = React.useState(false);

    return (
        <div className={`shell-execution-tool container ${isExpanded ? 'expanded' : ''}`}>
            <div
                className="shell-execution-tool header canceled"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className={codicon('terminal')} />
                <code className="shell-execution-tool command-preview">{truncateCommand(input.command)}</code>
                <span className="shell-execution-tool meta-badges">
                    {canceledResult?.duration !== undefined && (
                        <span className="shell-execution-tool duration">{formatDuration(canceledResult.duration)}</span>
                    )}
                    <span className="shell-execution-tool status-label canceled">
                        {nls.localize('theia/ai-terminal/executionCanceled', 'Canceled')}
                    </span>
                </span>
            </div>
            {isExpanded && (
                <div className="shell-execution-tool expanded-content">
                    <CommandDisplay command={input.command} clipboardService={clipboardService} />
                    {input.cwd && (
                        <MetaRow icon="folder" label={nls.localize('theia/ai-terminal/workingDirectory', 'Working directory')}>
                            {input.cwd}
                        </MetaRow>
                    )}
                    {canceledResult?.output && (
                        <OutputBox
                            title={nls.localize('theia/ai-terminal/partialOutput', 'Partial Output')}
                            output={canceledResult.output}
                            clipboardService={clipboardService}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

interface FinishedUIProps {
    input: ShellExecutionInput;
    result?: ShellExecutionToolResult;
    clipboardService: ClipboardService;
}

const FinishedUI: React.FC<FinishedUIProps> = ({
    input,
    result,
    clipboardService
}) => {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const isSuccess = result?.success ?? false;

    return (
        <div className={`shell-execution-tool container ${isExpanded ? 'expanded' : ''}`}>
            <div
                className={`shell-execution-tool header finished ${isSuccess ? 'success' : 'failure'}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className={codicon('terminal')} />
                <code className="shell-execution-tool command-preview">{truncateCommand(input.command)}</code>
                <span className="shell-execution-tool meta-badges">
                    {result?.duration !== undefined && (
                        <span className="shell-execution-tool duration">{formatDuration(result.duration)}</span>
                    )}
                    {result?.exitCode !== undefined && result.exitCode !== 0 && (
                        <span className="shell-execution-tool exit-code">{result.exitCode}</span>
                    )}
                    <span className={`${codicon(isSuccess ? 'check' : 'error')} shell-execution-tool status-icon ${isSuccess ? 'success' : 'failure'}`} />
                </span>
            </div>
            {isExpanded && (
                <div className="shell-execution-tool expanded-content">
                    <CommandDisplay command={input.command} clipboardService={clipboardService} />
                    {(result?.cwd || input.cwd) && (
                        <MetaRow icon="folder" label={nls.localize('theia/ai-terminal/workingDirectory', 'Working directory')}>
                            {result?.cwd || input.cwd}
                        </MetaRow>
                    )}
                    {result?.error && (
                        <div className="shell-execution-tool error-message">
                            {result.error}
                        </div>
                    )}
                    <OutputBox
                        title={nls.localizeByDefault('Output')}
                        output={result?.output}
                        clipboardService={clipboardService}
                    />
                </div>
            )}
        </div>
    );
};

interface CommandDisplayProps {
    command: string;
    clipboardService: ClipboardService;
}

const CommandDisplay: React.FC<CommandDisplayProps> = ({ command, clipboardService }) => (
    <div className="shell-execution-tool full-command-container">
        <div className="shell-execution-tool full-command">
            <span className="shell-execution-tool prompt">$</span>
            <code>{command}</code>
        </div>
        <CopyButton text={command} clipboardService={clipboardService} />
    </div>
);

interface MetaRowProps {
    icon: string;
    label: string;
    children: React.ReactNode;
}

const MetaRow: React.FC<MetaRowProps> = ({ icon, label, children }) => (
    <div className="shell-execution-tool meta-row" title={label}>
        <span className={codicon(icon)} />
        <span>{children}</span>
    </div>
);

interface OutputBoxProps {
    title: string;
    output?: string;
    clipboardService: ClipboardService;
}

const OutputBox: React.FC<OutputBoxProps> = ({ title, output, clipboardService }) => (
    <div className="shell-execution-tool output-box">
        <div className="shell-execution-tool output-header">
            <span className={codicon('output')} />
            {title}
            {output && <CopyButton text={output} clipboardService={clipboardService} />}
        </div>
        {output ? (
            <pre className="shell-execution-tool output">{output}</pre>
        ) : (
            <div className="shell-execution-tool no-output">
                {nls.localize('theia/ai-terminal/noOutput', 'No output')}
            </div>
        )}
    </div>
);

interface CopyButtonProps {
    text: string;
    clipboardService: ClipboardService;
}

const CopyButton: React.FC<CopyButtonProps> = ({ text, clipboardService }) => {
    const handleCopy = React.useCallback(() => {
        clipboardService.writeText(text);
    }, [text, clipboardService]);

    return (
        <button
            className="shell-execution-tool copy-button"
            onClick={handleCopy}
            title={nls.localizeByDefault('Copy')}
        >
            <span className={codicon('copy')} />
        </button>
    );
};

function truncateCommand(command: string): string {
    // Only take first line, CSS handles the ellipsis truncation
    return command.split('\n')[0];
}

function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    if (ms < 60000) {
        return `${(ms / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
