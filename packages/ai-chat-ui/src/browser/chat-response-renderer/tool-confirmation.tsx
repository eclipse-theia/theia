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

import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';
import { codicon, ContextMenuRenderer } from '@theia/core/lib/browser';
import { ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { ToolRequest } from '@theia/ai-core';
import { CommandMenu, ContextExpressionMatcher, MenuPath } from '@theia/core/lib/common/menu';
import { GroupImpl } from '@theia/core/lib/browser/menu/composite-menu-node';
import { ToolConfirmationMode as ToolConfirmationPreferenceMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';

export type ToolConfirmationState = 'pending' | 'waiting' | 'allowed' | 'denied' | 'rejected';

export type ConfirmationScope = 'once' | 'session' | 'forever';

/**
 * Shared hook that manages the confirmation state machine for tool calls.
 *
 * Handles initial state computation, auto-allow/deny via preference mode,
 * and wiring up the response's confirmation and user-confirmation promises.
 */
export function useToolConfirmationState(
    response: ToolCallChatResponseContent,
    confirmationMode: ToolConfirmationPreferenceMode
): { confirmationState: ToolConfirmationState; rejectionReason: unknown } {
    const getInitialState = (): ToolConfirmationState => {
        if (confirmationMode === ToolConfirmationPreferenceMode.ALWAYS_ALLOW) {
            return 'allowed';
        }
        if (confirmationMode === ToolConfirmationPreferenceMode.DISABLED) {
            return 'denied';
        }
        if (response.finished) {
            return ToolCallChatResponseContent.isDenialResult(response.result) ? 'denied' : 'allowed';
        }
        return 'pending';
    };

    const [confirmationState, setConfirmationState] = React.useState<ToolConfirmationState>(getInitialState);
    const [rejectionReason, setRejectionReason] = React.useState<unknown>(undefined);

    React.useEffect(() => {
        if (confirmationMode === ToolConfirmationPreferenceMode.ALWAYS_ALLOW) {
            response.confirm();
            setConfirmationState('allowed');
            return;
        } else if (confirmationMode === ToolConfirmationPreferenceMode.DISABLED) {
            response.deny();
            setConfirmationState('denied');
            return;
        }
        response.confirmed
            .then(confirmed => {
                setConfirmationState(confirmed ? 'allowed' : 'denied');
            })
            .catch(reason => {
                setRejectionReason(reason);
                setConfirmationState('rejected');
            });
        response.needsUserConfirmation.then(() => {
            setConfirmationState(prev => prev === 'pending' ? 'waiting' : prev);
        });
    }, [response, confirmationMode]);

    return { confirmationState, rejectionReason };
}

export interface ToolConfirmationCallbacks {
    toolRequest?: ToolRequest;
    onAllow: (scope: ConfirmationScope) => void;
    onDeny: (scope: ConfirmationScope, reason?: string) => void;
}

export interface ToolConfirmationActionsProps extends ToolConfirmationCallbacks {
    toolName: string;
    contextMenuRenderer: ContextMenuRenderer;
}

export class InlineActionMenuNode implements CommandMenu {
    constructor(
        readonly id: string,
        readonly label: string,
        private readonly action: () => void,
        readonly sortString: string,
        readonly icon?: string
    ) { }

    isVisible<T>(_effectiveMenuPath: MenuPath, _contextMatcher: ContextExpressionMatcher<T>, _context: T | undefined): boolean {
        return true;
    }

    isEnabled(): boolean {
        return true;
    }

    isToggled(): boolean {
        return false;
    }

    async run(): Promise<void> {
        this.action();
    }
}

export const ToolConfirmationActions: React.FC<ToolConfirmationActionsProps> = ({
    toolName,
    toolRequest,
    onAllow,
    onDeny,
    contextMenuRenderer
}) => {
    const [allowScope, setAllowScope] = React.useState<ConfirmationScope>('once');
    const [denyScope, setDenyScope] = React.useState<ConfirmationScope>('once');
    const [showAlwaysAllowConfirmation, setShowAlwaysAllowConfirmation] = React.useState(false);
    const [showDenyReasonInput, setShowDenyReasonInput] = React.useState(false);
    const [denyReason, setDenyReason] = React.useState('');
    // eslint-disable-next-line no-null/no-null
    const denyReasonInputRef = React.useRef<HTMLInputElement>(null);

    const handleAllow = React.useCallback(() => {
        if ((allowScope === 'forever' || allowScope === 'session') && toolRequest?.confirmAlwaysAllow) {
            setShowAlwaysAllowConfirmation(true);
            return;
        }
        onAllow(allowScope);
    }, [onAllow, allowScope, toolRequest]);

    const handleConfirmAlwaysAllow = React.useCallback(() => {
        setShowAlwaysAllowConfirmation(false);
        onAllow(allowScope);
    }, [onAllow, allowScope]);

    const handleCancelAlwaysAllow = React.useCallback(() => {
        setShowAlwaysAllowConfirmation(false);
    }, []);

    const handleDeny = React.useCallback(() => {
        onDeny(denyScope);
    }, [onDeny, denyScope]);

    const handleDenyWithReason = React.useCallback(() => {
        setShowDenyReasonInput(true);
    }, []);

    const handleSubmitDenyReason = React.useCallback(() => {
        onDeny('once', denyReason.trim() || undefined);
        setShowDenyReasonInput(false);
        setDenyReason('');
    }, [onDeny, denyReason]);

    const handleCancelDenyReason = React.useCallback(() => {
        setShowDenyReasonInput(false);
        setDenyReason('');
    }, []);

    const handleDenyReasonKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmitDenyReason();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancelDenyReason();
        }
    }, [handleSubmitDenyReason, handleCancelDenyReason]);

    React.useEffect(() => {
        if (showDenyReasonInput && denyReasonInputRef.current) {
            denyReasonInputRef.current.focus();
        }
    }, [showDenyReasonInput]);

    const SCOPES: ConfirmationScope[] = ['once', 'session', 'forever'];

    const scopeLabel = (type: 'allow' | 'deny', scope: ConfirmationScope): string => {
        if (type === 'allow') {
            switch (scope) {
                case 'once': return nls.localizeByDefault('Allow');
                case 'session': return nls.localize('theia/ai/chat-ui/toolconfirmation/allow-session', 'Allow for this Chat');
                case 'forever': return nls.localizeByDefault('Always Allow');
            }
        } else {
            switch (scope) {
                case 'once': return nls.localizeByDefault('Deny');
                case 'session': return nls.localize('theia/ai/chat-ui/toolconfirmation/deny-session', 'Deny for this Chat');
                case 'forever': return nls.localize('theia/ai/chat-ui/toolconfirmation/deny-forever', 'Always Deny');
            }
        }
    };

    const getAlwaysAllowWarning = (): string => {
        if (typeof toolRequest?.confirmAlwaysAllow === 'string') {
            return toolRequest.confirmAlwaysAllow;
        }
        return nls.localize(
            'theia/ai/chat-ui/toolconfirmation/alwaysAllowGenericWarning',
            'This tool requires confirmation before auto-approval can be enabled. ' +
            'Once enabled, all future invocations will execute without confirmation. ' +
            'Only enable this if you trust this tool and understand the potential risks.'
        );
    };

    const showDropdownMenu = React.useCallback((
        event: React.MouseEvent<HTMLButtonElement>,
        type: 'allow' | 'deny',
        selectedScope: ConfirmationScope,
        setScope: (scope: ConfirmationScope) => void
    ) => {
        const otherScopes = SCOPES.filter(s => s !== selectedScope);
        const menu = new GroupImpl('tool-confirmation-dropdown');

        const scopesGroup = new GroupImpl('scopes', '1');
        otherScopes.forEach((scope, index) => {
            scopesGroup.addNode(new InlineActionMenuNode(
                `tool-confirmation-${type}-${scope}`,
                scopeLabel(type, scope),
                () => setScope(scope),
                String(index)
            ));
        });
        menu.addNode(scopesGroup);

        if (type === 'deny') {
            const reasonGroup = new GroupImpl('reason', '2');
            reasonGroup.addNode(new InlineActionMenuNode(
                'tool-confirmation-deny-with-reason',
                nls.localize('theia/ai/chat-ui/toolconfirmation/deny-with-reason', 'Deny with reason...'),
                handleDenyWithReason,
                '0'
            ));
            menu.addNode(reasonGroup);
        }

        const splitButtonContainer = event.currentTarget.parentElement;
        const containerRect = splitButtonContainer?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
        contextMenuRenderer.render({
            menuPath: ['tool-confirmation-context-menu'],
            menu,
            anchor: { x: containerRect.left, y: containerRect.bottom },
            context: event.currentTarget,
            skipSingleRootNode: true
        });
    }, [contextMenuRenderer, handleDenyWithReason, scopeLabel]);

    const renderSplitButton = (type: 'allow' | 'deny'): React.ReactNode => {
        const selectedScope = type === 'allow' ? allowScope : denyScope;
        const setScope = type === 'allow' ? setAllowScope : setDenyScope;
        const handleMain = type === 'allow' ? handleAllow : handleDeny;

        return (
            <div
                className={`theia-tool-confirmation-split-button ${type}`}
                style={{ display: 'inline-flex', position: 'relative' }}
            >
                <button
                    className={`theia-button ${type === 'allow' ? 'main' : 'secondary'} theia-tool-confirmation-main-btn`}
                    onClick={handleMain}
                >
                    {scopeLabel(type, selectedScope)}
                </button>
                <button
                    className={`theia-button ${type === 'allow' ? 'main' : 'secondary'} theia-tool-confirmation-chevron-btn`}
                    onClick={e => showDropdownMenu(e, type, selectedScope, setScope)}
                    aria-haspopup="true"
                    tabIndex={0}
                    title={type === 'allow'
                        ? nls.localize('theia/ai/chat-ui/toolconfirmation/allow-options-dropdown-tooltip', 'More Allow Options')
                        : nls.localize('theia/ai/chat-ui/toolconfirmation/deny-options-dropdown-tooltip', 'More Deny Options')}
                >
                    <span className={codicon('chevron-down')}></span>
                </button>
            </div>
        );
    };

    if (showAlwaysAllowConfirmation) {
        return (
            <div className="theia-tool-confirmation-always-allow-modal">
                <div className="theia-tool-confirmation-header">
                    <span className={codicon('warning')}></span>
                    {nls.localize('theia/ai/chat-ui/toolconfirmation/alwaysAllowTitle', 'Enable Auto-Approval for "{0}"?', toolName)}
                </div>
                <div className="theia-tool-confirmation-warning">
                    {getAlwaysAllowWarning()}
                </div>
                <div className="theia-tool-confirmation-actions">
                    <button
                        className="theia-button secondary"
                        onClick={handleCancelAlwaysAllow}
                    >
                        {nls.localizeByDefault('Cancel')}
                    </button>
                    <button
                        className="theia-button main"
                        onClick={handleConfirmAlwaysAllow}
                    >
                        {nls.localize('theia/ai/chat-ui/toolconfirmation/alwaysAllowConfirm', 'I understand, enable auto-approval')}
                    </button>
                </div>
            </div>
        );
    }

    if (showDenyReasonInput) {
        return (
            <div className="theia-tool-confirmation-deny-reason">
                <input
                    ref={denyReasonInputRef}
                    type="text"
                    className="theia-input theia-tool-confirmation-deny-reason-input"
                    placeholder={nls.localize('theia/ai/chat-ui/toolconfirmation/deny-reason-placeholder', 'Enter reason for denial...')}
                    value={denyReason}
                    onChange={e => setDenyReason(e.target.value)}
                    onKeyDown={handleDenyReasonKeyDown}
                />
                <div className="theia-tool-confirmation-deny-reason-actions">
                    <button
                        className="theia-button secondary"
                        onClick={handleCancelDenyReason}
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
        );
    }

    return (
        <div className="theia-tool-confirmation-actions">
            {renderSplitButton('deny')}
            {renderSplitButton('allow')}
        </div>
    );
};

export interface ToolConfirmationProps extends Pick<ToolConfirmationCallbacks, 'toolRequest'> {
    response: ToolCallChatResponseContent;
    onAllow: (scope?: ConfirmationScope) => void;
    onDeny: (scope?: ConfirmationScope, reason?: string) => void;
    contextMenuRenderer: ContextMenuRenderer;
}

export const ToolConfirmation: React.FC<ToolConfirmationProps> = ({ response, toolRequest, onAllow, onDeny, contextMenuRenderer }) => {
    const [state, setState] = React.useState<ToolConfirmationState>('waiting');

    const handleAllow = React.useCallback((scope: ConfirmationScope) => {
        setState('allowed');
        onAllow(scope);
    }, [onAllow]);

    const handleDeny = React.useCallback((scope: ConfirmationScope, reason?: string) => {
        setState('denied');
        onDeny(scope, reason);
    }, [onDeny]);

    if (state === 'allowed') {
        return (
            <div className="theia-tool-confirmation-status allowed">
                <span className={codicon('check')}></span> {nls.localize('theia/ai/chat-ui/toolconfirmation/allowed', 'Tool execution allowed')}
            </div>
        );
    }

    if (state === 'denied') {
        return (
            <div className="theia-tool-confirmation-status denied">
                <span className={codicon('close')}></span> {nls.localize('theia/ai/chat-ui/toolconfirmation/denied', 'Tool execution denied')}
            </div>
        );
    }

    return (
        <div className="theia-tool-confirmation">
            <div className="theia-tool-confirmation-header">
                <span className={codicon('shield')}></span> {nls.localize('theia/ai/chat-ui/toolconfirmation/header', 'Confirm Tool Execution')}
            </div>
            <div className="theia-tool-confirmation-info">
                <div className="theia-tool-confirmation-name">
                    <span className="label">{nls.localizeByDefault('Tool')}:</span>
                    <span className="value">{response.name}</span>
                </div>
            </div>
            <ToolConfirmationActions
                toolName={response.name ?? 'unknown'}
                toolRequest={toolRequest}
                onAllow={handleAllow}
                onDeny={handleDeny}
                contextMenuRenderer={contextMenuRenderer}
            />
        </div>
    );
};

export interface WithToolCallConfirmationProps {
    response: ToolCallChatResponseContent;
    confirmationMode: ToolConfirmationPreferenceMode;
    toolConfirmationManager: ToolConfirmationManager;
    toolRequest?: ToolRequest;
    chatId: string;
    getArgumentsLabel?: (toolName: string | undefined, args: string | undefined) => string;
    showArgsTooltip?: (response: ToolCallChatResponseContent, target: HTMLElement | undefined) => void;
    requestCanceled: boolean;
    contextMenuRenderer: ContextMenuRenderer;
}

export function withToolCallConfirmation<P extends object>(
    WrappedComponent: React.ComponentType<P>
): React.FC<P & WithToolCallConfirmationProps> {
    const WithConfirmation: React.FC<P & WithToolCallConfirmationProps> = props => {
        const {
            response,
            confirmationMode,
            toolConfirmationManager,
            toolRequest,
            chatId,
            getArgumentsLabel,
            showArgsTooltip,
            requestCanceled,
            contextMenuRenderer,
            ...componentProps
        } = props;

        const { confirmationState } = useToolConfirmationState(response, confirmationMode);
        const pendingRef = React.useRef<HTMLElement | undefined>(undefined);

        const argsLabel = getArgumentsLabel?.(response.name, response.arguments) ?? '';

        const handleAllow = React.useCallback((scope: ConfirmationScope = 'once') => {
            if (scope === 'forever' && response.name) {
                toolConfirmationManager.setConfirmationMode(response.name, ToolConfirmationPreferenceMode.ALWAYS_ALLOW, toolRequest);
            } else if (scope === 'session' && response.name) {
                toolConfirmationManager.setSessionConfirmationMode(response.name, ToolConfirmationPreferenceMode.ALWAYS_ALLOW, chatId);
            }
            response.confirm();
        }, [response, toolConfirmationManager, chatId, toolRequest]);

        const handleDeny = React.useCallback((scope: ConfirmationScope = 'once', reason?: string) => {
            if (scope === 'forever' && response.name) {
                toolConfirmationManager.setConfirmationMode(response.name, ToolConfirmationPreferenceMode.DISABLED);
            } else if (scope === 'session' && response.name) {
                toolConfirmationManager.setSessionConfirmationMode(response.name, ToolConfirmationPreferenceMode.DISABLED, chatId);
            }
            response.deny(reason);
        }, [response, toolConfirmationManager, chatId]);

        if (confirmationState === 'rejected' || (requestCanceled && !response.finished)) {
            return (
                <div className="theia-tool-confirmation-status rejected">
                    <span className={codicon('error')}></span> {nls.localize('theia/ai/chat-ui/toolconfirmation/canceled', 'Tool execution canceled')}
                </div>
            );
        }

        if (confirmationState === 'denied') {
            return (
                <div className="theia-tool-confirmation-status denied">
                    <span className={codicon('error')}></span> {nls.localize('theia/ai/chat-ui/toolconfirmation/executionDenied', 'Tool execution denied')}
                </div>
            );
        }

        if (confirmationState === 'pending') {
            return (
                <div className="theia-tool-confirmation-status pending"
                    ref={(el: HTMLElement | null) => { pendingRef.current = el ?? undefined; }}
                    onMouseEnter={() => showArgsTooltip?.(response, pendingRef.current)}
                >
                    <span className={`${codicon('loading')} theia-animation-spin`}></span> {response.name}
                    (<span className='theia-toolCall-args-label'>{argsLabel}</span>)
                </div>
            );
        }

        if (confirmationState === 'waiting' && !requestCanceled && !response.finished) {
            return (
                <ToolConfirmation
                    response={response}
                    toolRequest={toolRequest}
                    onAllow={handleAllow}
                    onDeny={handleDeny}
                    contextMenuRenderer={contextMenuRenderer}
                />
            );
        }

        return <WrappedComponent {...componentProps as P} />;
    };

    WithConfirmation.displayName = `withToolCallConfirmation(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
    return WithConfirmation;
}
