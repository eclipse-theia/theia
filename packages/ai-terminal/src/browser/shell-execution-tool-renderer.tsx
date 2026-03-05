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
import { InlineActionMenuNode, useToolConfirmationState } from '@theia/ai-chat-ui/lib/browser/chat-response-renderer/tool-confirmation';
import { ChatResponseContent, ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { ToolConfirmationMode as ToolConfirmationPreferenceMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import { ToolInvocationRegistry, ToolRequest } from '@theia/ai-core';
import { CommandRegistry, nls } from '@theia/core/lib/common';
import { codicon, ContextMenuRenderer } from '@theia/core/lib/browser';
import { GroupImpl } from '@theia/core/lib/browser/menu/composite-menu-node';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import { ShellExecutionTool } from './shell-execution-tool';
import { ShellCommandPermissionService } from './shell-command-permission-service';
import {
    SHELL_EXECUTION_FUNCTION_ID,
    ShellExecutionToolResult,
    ShellExecutionCanceledResult
} from '../common/shell-execution-server';
import { parseShellExecutionInput, ShellExecutionInput } from '../common/shell-execution-input-parser';
import { generateCommandPatterns, flattenSuggestions, PatternSuggestion } from '../common/shell-command-patterns';

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

    @inject(ContextMenuRenderer)
    protected contextMenuRenderer: ContextMenuRenderer;

    @inject(ShellCommandPermissionService)
    protected shellCommandPermissionService: ShellCommandPermissionService;

    @inject(CommandRegistry)
    protected commandRegistry: CommandRegistry;

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
                toolRequest={toolRequest}
                shellExecutionTool={this.shellExecutionTool}
                clipboardService={this.clipboardService}
                chatId={chatId}
                requestCanceled={parentNode.response.isCanceled}
                contextMenuRenderer={this.contextMenuRenderer}
                shellCommandPermissionService={this.shellCommandPermissionService}
                commandRegistry={this.commandRegistry}
            />
        );
    }
}

interface ShellExecutionToolComponentProps {
    response: ToolCallChatResponseContent;
    input: ShellExecutionInput;
    confirmationMode: ToolConfirmationPreferenceMode;
    toolConfirmationManager: ToolConfirmationManager;
    toolRequest?: ToolRequest;
    shellExecutionTool: ShellExecutionTool;
    clipboardService: ClipboardService;
    chatId: string;
    requestCanceled: boolean;
    contextMenuRenderer: ContextMenuRenderer;
    shellCommandPermissionService: ShellCommandPermissionService;
    commandRegistry: CommandRegistry;
}

const ShellExecutionToolComponent: React.FC<ShellExecutionToolComponentProps> = ({
    response,
    input,
    confirmationMode,
    toolConfirmationManager,
    toolRequest,
    shellExecutionTool,
    clipboardService,
    chatId,
    requestCanceled,
    contextMenuRenderer,
    shellCommandPermissionService,
    commandRegistry
}) => {
    const { confirmationState } = useToolConfirmationState(response, confirmationMode);
    const [toolFinished, setToolFinished] = React.useState(response.finished);
    const [isCanceling, setIsCanceling] = React.useState(false);

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

    const handleAllow = React.useCallback((patterns?: string[]) => {
        if (patterns && patterns.length > 0) {
            try {
                shellCommandPermissionService.addAllowlistPatterns(...patterns);
            } catch (err) {
                console.warn('Failed to add allowlist patterns:', err);
            }
        }
        response.confirm();
    }, [response, shellCommandPermissionService]);

    const handleDeny = React.useCallback((options?: { patterns?: string[]; reason?: string }) => {
        if (options?.patterns && options.patterns.length > 0) {
            try {
                shellCommandPermissionService.addDenylistPatterns(...options.patterns);
            } catch (err) {
                console.warn('Failed to add denylist patterns:', err);
            }
        }
        response.deny(options?.reason);
    }, [response, shellCommandPermissionService]);

    const handleAllowAllForever = React.useCallback(() => {
        toolConfirmationManager.setConfirmationMode(SHELL_EXECUTION_FUNCTION_ID, ToolConfirmationPreferenceMode.ALWAYS_ALLOW, toolRequest);
        response.confirm();
    }, [response, toolConfirmationManager, toolRequest]);

    const handleAllowAllSession = React.useCallback(() => {
        toolConfirmationManager.setSessionConfirmationMode(SHELL_EXECUTION_FUNCTION_ID, ToolConfirmationPreferenceMode.ALWAYS_ALLOW, chatId);
        response.confirm();
    }, [response, toolConfirmationManager, chatId]);

    // Command and tab IDs from @theia/ai-ide (OPEN_AI_CONFIG_VIEW.id / ToolsConfigurationWidget.ID).
    // The package may not be present, so guard via commandRegistry.getCommand().
    const hasPermissionsConfiguration = React.useMemo(() =>
        commandRegistry.getCommand('aiConfiguration:open') !== undefined,
    [commandRegistry]);

    const openPermissionsConfiguration = React.useCallback(() => {
        commandRegistry.executeCommand('aiConfiguration:open', 'ai-tools-configuration-widget');
    }, [commandRegistry]);

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

    if (confirmationState === 'pending') {
        return (
            <div className="shell-execution-tool container">
                <div className="shell-execution-tool header running">
                    <span className={codicon('terminal')} />
                    <code className="shell-execution-tool command-preview">{truncateCommand(input.command)}</code>
                    <span className="shell-execution-tool meta-badges">
                        <span className={`${codicon('loading')} shell-execution-tool status-icon theia-animation-spin`} />
                    </span>
                </div>
            </div>
        );
    }

    if (confirmationState === 'waiting' && !requestCanceled && !toolFinished) {
        return (
            <ConfirmationUI
                input={input}
                shellCommandPermissionService={shellCommandPermissionService}
                onAllow={handleAllow}
                onAllowAllForever={handleAllowAllForever}
                onAllowAllSession={handleAllowAllSession}
                onDeny={handleDeny}
                contextMenuRenderer={contextMenuRenderer}
                openPermissionsConfiguration={hasPermissionsConfiguration ? openPermissionsConfiguration : undefined}
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
    shellCommandPermissionService: ShellCommandPermissionService;
    onAllow: (patterns?: string[]) => void;
    onAllowAllForever: () => void;
    onAllowAllSession: () => void;
    onDeny: (options?: { patterns?: string[]; reason?: string }) => void;
    contextMenuRenderer: ContextMenuRenderer;
    openPermissionsConfiguration?: () => void;
}

const ConfirmationUI: React.FC<ConfirmationUIProps> = ({
    input,
    shellCommandPermissionService,
    onAllow,
    onAllowAllForever,
    onAllowAllSession,
    onDeny,
    contextMenuRenderer,
    openPermissionsConfiguration
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

            <ShellExecutionConfirmationActions
                command={input.command}
                shellCommandPermissionService={shellCommandPermissionService}
                onAllow={onAllow}
                onAllowAllForever={onAllowAllForever}
                onAllowAllSession={onAllowAllSession}
                onDeny={onDeny}
                contextMenuRenderer={contextMenuRenderer}
                openPermissionsConfiguration={openPermissionsConfiguration}
            />
        </div>
    </div>
);

/**
 * Discriminated union for the confirmation actions UI state machine.
 * - 'buttons': Default state showing Allow/Deny split buttons
 * - 'deny-reason': User is entering a reason for denial
 * - 'allow-all-session': Confirming "allow all" for the current chat session
 * - 'allow-all-forever': Confirming "allow all" permanently
 */
type ConfirmationActionsState =
    | { kind: 'buttons' }
    | { kind: 'deny-reason'; denyReason: string }
    | { kind: 'allow-all-session' }
    | { kind: 'allow-all-forever' };

interface ShellExecutionConfirmationActionsProps {
    command: string;
    shellCommandPermissionService: ShellCommandPermissionService;
    onAllow: (patterns?: string[]) => void;
    onAllowAllForever: () => void;
    onAllowAllSession: () => void;
    onDeny: (options?: { patterns?: string[]; reason?: string }) => void;
    contextMenuRenderer: ContextMenuRenderer;
    openPermissionsConfiguration?: () => void;
}

const ShellExecutionConfirmationActions: React.FC<ShellExecutionConfirmationActionsProps> = ({
    command,
    shellCommandPermissionService,
    onAllow,
    onAllowAllForever,
    onAllowAllSession,
    onDeny,
    contextMenuRenderer,
    openPermissionsConfiguration
}) => {
    const [uiState, setUiState] = React.useState<ConfirmationActionsState>({ kind: 'buttons' });

    const handleSubmitDenyReason = React.useCallback(() => {
        if (uiState.kind !== 'deny-reason') {
            return;
        }
        onDeny({ reason: uiState.denyReason.trim() || undefined });
        setUiState({ kind: 'buttons' });
    }, [onDeny, uiState]);

    const handleCancelSecondaryState = React.useCallback(() => {
        setUiState({ kind: 'buttons' });
    }, []);

    const handleDenyReasonKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmitDenyReason();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancelSecondaryState();
        }
    }, [handleSubmitDenyReason, handleCancelSecondaryState]);

    const showAllowDropdown = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        const analysis = shellCommandPermissionService.analyzeCommand(command);
        const allowSuggestions = analysis.hasDangerousPatterns
            ? []
            : generateCommandPatterns(analysis.unallowedSubCommands);

        const menu = new GroupImpl('shell-execution-allow-dropdown');

        if (allowSuggestions.length > 0) {
            const patternsGroup = new GroupImpl('patterns', '1');

            allowSuggestions.forEach((suggestion, index) => {
                patternsGroup.addNode(new InlineActionMenuNode(
                    `always-allow-${index}`,
                    formatSuggestionLabel(suggestion, 'allow'),
                    () => onAllow(suggestion.patterns),
                    String(index)
                ));
            });

            menu.addNode(patternsGroup);
        }

        const allowAllGroup = new GroupImpl('allow-all', '2');
        allowAllGroup.addNode(new InlineActionMenuNode(
            'allow-all-session',
            nls.localize('theia/ai-terminal/allowAllSession', 'Allow all shell commands for this chat...'),
            () => setUiState({ kind: 'allow-all-session' }),
            '0'
        ));
        allowAllGroup.addNode(new InlineActionMenuNode(
            'allow-all-forever',
            nls.localize('theia/ai-terminal/allowAllForever', 'Always allow all shell commands...'),
            () => setUiState({ kind: 'allow-all-forever' }),
            '1'
        ));
        menu.addNode(allowAllGroup);

        const splitButtonContainer = event.currentTarget.parentElement;
        const containerRect = splitButtonContainer?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
        contextMenuRenderer.render({
            menuPath: ['shell-execution-allow-context-menu'],
            menu,
            anchor: { x: containerRect.left, y: containerRect.bottom },
            context: event.currentTarget,
            skipSingleRootNode: true
        });
    }, [contextMenuRenderer, shellCommandPermissionService, command, onAllow]);

    const showDenyDropdown = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        const analysis = shellCommandPermissionService.analyzeCommand(command);
        const denySuggestions = flattenSuggestions(generateCommandPatterns(analysis.subCommands));

        const menu = new GroupImpl('shell-execution-deny-dropdown');

        if (denySuggestions.length > 0) {
            const patternsGroup = new GroupImpl('patterns', '1');

            denySuggestions.forEach((suggestion, index) => {
                patternsGroup.addNode(new InlineActionMenuNode(
                    `always-deny-${index}`,
                    formatSuggestionLabel(suggestion, 'deny'),
                    () => onDeny({ patterns: suggestion.patterns }),
                    String(index)
                ));
            });

            menu.addNode(patternsGroup);
        }

        const reasonGroup = new GroupImpl('reason', '2');
        reasonGroup.addNode(new InlineActionMenuNode(
            'deny-with-reason',
            nls.localize('theia/ai/chat-ui/toolconfirmation/deny-with-reason', 'Deny with reason...'),
            () => setUiState({ kind: 'deny-reason', denyReason: '' }),
            '0'
        ));
        menu.addNode(reasonGroup);

        const splitButtonContainer = event.currentTarget.parentElement;
        const containerRect = splitButtonContainer?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
        contextMenuRenderer.render({
            menuPath: ['shell-execution-deny-context-menu'],
            menu,
            anchor: { x: containerRect.left, y: containerRect.bottom },
            context: event.currentTarget,
            skipSingleRootNode: true
        });
    }, [contextMenuRenderer, shellCommandPermissionService, command, onDeny]);

    if (uiState.kind === 'allow-all-session' || uiState.kind === 'allow-all-forever') {
        const isSession = uiState.kind === 'allow-all-session';
        return (
            <div>
                <div className="theia-tool-confirmation-always-allow-modal">
                    <div className="theia-tool-confirmation-header">
                        <span className={codicon('warning')}></span>
                        {isSession
                            ? nls.localize('theia/ai-terminal/allowAllSessionTitle', 'Allow ALL Shell Commands for This Chat?')
                            : nls.localize('theia/ai-terminal/allowAllTitle', 'Allow ALL Shell Commands?')
                        }
                    </div>
                    <div className="theia-tool-confirmation-warning">
                        {isSession
                            ? nls.localize('theia/ai-terminal/allowAllSessionWarning',
                                'This will allow the AI to execute any shell command without confirmation for the remainder of this chat session. ' +
                                'Shell commands have full system access and can execute any command, ' +
                                'modify files outside the workspace, and access network resources. ' +
                                'Commands on the deny list will still be blocked.'
                            )
                            : nls.localize('theia/ai-terminal/allowAllWarning',
                                'This will allow the AI to execute any shell command without confirmation. ' +
                                'Shell commands have full system access and can execute any command, ' +
                                'modify files outside the workspace, and access network resources. ' +
                                'Commands on the deny list will still be blocked.'
                            )
                        }
                    </div>
                    <div className="theia-tool-confirmation-actions">
                        <button
                            className="theia-button secondary"
                            onClick={handleCancelSecondaryState}
                        >
                            {nls.localizeByDefault('Cancel')}
                        </button>
                        <button
                            className="theia-button main"
                            onClick={() => {
                                setUiState({ kind: 'buttons' });
                                if (isSession) {
                                    onAllowAllSession();
                                } else {
                                    onAllowAllForever();
                                }
                            }}
                        >
                            {isSession
                                ? nls.localize('theia/ai-terminal/allowAllSessionConfirm', 'I understand, allow all for this chat')
                                : nls.localize('theia/ai-terminal/allowAllConfirm', 'I understand, allow all')
                            }
                        </button>
                    </div>
                </div>
                <ConfigurationLink openPermissionsConfiguration={openPermissionsConfiguration} />
            </div>
        );
    }

    if (uiState.kind === 'deny-reason') {
        return (
            <div>
                <div className="theia-tool-confirmation-deny-reason">
                    <input
                        autoFocus
                        type="text"
                        className="theia-input theia-tool-confirmation-deny-reason-input"
                        placeholder={nls.localize('theia/ai/chat-ui/toolconfirmation/deny-reason-placeholder', 'Enter reason for denial...')}
                        value={uiState.denyReason}
                        onChange={e => setUiState({ kind: 'deny-reason', denyReason: e.target.value })}
                        onKeyDown={handleDenyReasonKeyDown}
                    />
                    <div className="theia-tool-confirmation-deny-reason-actions">
                        <button
                            className="theia-button secondary"
                            onClick={handleCancelSecondaryState}
                        >
                            {nls.localizeByDefault('Cancel')}
                        </button>
                        <button
                            className="theia-button main"
                            onClick={handleSubmitDenyReason}
                        >
                            {nls.localizeByDefault('Deny')}
                        </button>
                    </div>
                </div>
                <ConfigurationLink openPermissionsConfiguration={openPermissionsConfiguration} />
            </div>
        );
    }

    return (
        <div>
            <div className="theia-tool-confirmation-actions">
                <div
                    className="theia-tool-confirmation-split-button deny"
                >
                    <button
                        className="theia-button secondary theia-tool-confirmation-main-btn"
                        onClick={() => onDeny()}
                    >
                        {nls.localizeByDefault('Deny')}
                    </button>
                    <button
                        className="theia-button secondary theia-tool-confirmation-chevron-btn"
                        onClick={showDenyDropdown}
                        aria-haspopup="true"
                        aria-label={nls.localize('theia/ai/chat-ui/toolconfirmation/deny-options-dropdown-tooltip', 'More Deny Options')}
                        tabIndex={0}
                        title={nls.localize('theia/ai/chat-ui/toolconfirmation/deny-options-dropdown-tooltip', 'More Deny Options')}
                    >
                        <span className={codicon('chevron-down')}></span>
                    </button>
                </div>

                <div
                    className="theia-tool-confirmation-split-button allow"
                >
                    <button
                        className="theia-button main theia-tool-confirmation-main-btn"
                        onClick={() => onAllow()}
                    >
                        {nls.localizeByDefault('Allow')}
                    </button>
                    <button
                        className="theia-button main theia-tool-confirmation-chevron-btn"
                        onClick={showAllowDropdown}
                        aria-haspopup="true"
                        aria-label={nls.localize('theia/ai/chat-ui/toolconfirmation/allow-options-dropdown-tooltip', 'More Allow Options')}
                        tabIndex={0}
                        title={nls.localize('theia/ai/chat-ui/toolconfirmation/allow-options-dropdown-tooltip', 'More Allow Options')}
                    >
                        <span className={codicon('chevron-down')}></span>
                    </button>
                </div>
            </div>
            <ConfigurationLink openPermissionsConfiguration={openPermissionsConfiguration} />
        </div>
    );
};

const ConfigurationLink: React.FC<{ openPermissionsConfiguration?: () => void }> = ({ openPermissionsConfiguration }) => {
    if (!openPermissionsConfiguration) {
        // eslint-disable-next-line no-null/no-null
        return null;
    }
    return (
        <div className="shell-execution-tool configuration-link">
            <a
                role="button"
                tabIndex={0}
                onClick={openPermissionsConfiguration}
                onKeyDown={e => { if (e.key === 'Enter') { openPermissionsConfiguration(); } }}
            >
                <span className={codicon('gear')} />
                {nls.localize('theia/ai-terminal/configurePermissions', 'Configure shell command permissions')}
            </a>
        </div>
    );
};

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

function formatSuggestionLabel(suggestion: PatternSuggestion, action: 'allow' | 'deny'): string {
    const quoted = suggestion.patterns.map(p => `"${truncatePattern(p)}"`);
    if (quoted.length === 2) {
        return action === 'allow'
            ? nls.localize('theia/ai-terminal/alwaysAllowPatterns', 'Always allow {0} and {1}', quoted[0], quoted[1])
            : nls.localize('theia/ai-terminal/alwaysDenyPatterns', 'Always deny {0} and {1}', quoted[0], quoted[1]);
    }
    if (quoted.length > 2) {
        const list = quoted.join(', ');
        return action === 'allow'
            ? nls.localize('theia/ai-terminal/alwaysAllowPatternsList', 'Always allow {0}', list)
            : nls.localize('theia/ai-terminal/alwaysDenyPatternsList', 'Always deny {0}', list);
    }
    return action === 'allow'
        ? nls.localize('theia/ai-terminal/alwaysAllowPattern', 'Always allow {0}', quoted[0] ?? '')
        : nls.localize('theia/ai-terminal/alwaysDenyPattern', 'Always deny {0}', quoted[0] ?? '');
}

function truncateCommand(command: string): string {
    // Only take first line, CSS handles the ellipsis truncation
    return command.split('\n')[0];
}

function truncatePattern(pattern: string, maxLength: number = 50): string {
    if (pattern.length <= maxLength) {
        return pattern;
    }
    return pattern.substring(0, maxLength - 3) + '...';
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
