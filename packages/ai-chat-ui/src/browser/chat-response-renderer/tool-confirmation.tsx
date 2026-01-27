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
import { codicon } from '@theia/core/lib/browser';
import { ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { ToolRequest } from '@theia/ai-core';

/**
 * States the tool confirmation component can be in
 */
export type ToolConfirmationState = 'waiting' | 'allowed' | 'denied' | 'rejected';

/**
 * Mode for allow/deny actions
 */
export type ToolConfirmationMode = 'once' | 'session' | 'forever';

export interface ToolConfirmationCallbacks {
    toolRequest?: ToolRequest;
    onAllow: (mode: ToolConfirmationMode) => void;
    onDeny: (mode: ToolConfirmationMode, reason?: string) => void;
}

export interface ToolConfirmationActionsProps extends ToolConfirmationCallbacks {
    toolName: string;
}

/**
 * Reusable component that provides Allow/Deny split buttons with dropdown options.
 * Handles the confirmAlwaysAllow warning modal for dangerous tools.
 *
 * Use this component when you want to create a custom confirmation UI but reuse
 * the standard button behavior and confirmAlwaysAllow logic.
 */
export const ToolConfirmationActions: React.FC<ToolConfirmationActionsProps> = ({
    toolName,
    toolRequest,
    onAllow,
    onDeny
}) => {
    const [allowMode, setAllowMode] = React.useState<ToolConfirmationMode>('once');
    const [denyMode, setDenyMode] = React.useState<ToolConfirmationMode>('once');
    const [dropdownOpen, setDropdownOpen] = React.useState<'allow' | 'deny' | undefined>(undefined);
    const [dropdownDirection, setDropdownDirection] = React.useState<'above' | 'below'>('below');
    const [showAlwaysAllowConfirmation, setShowAlwaysAllowConfirmation] = React.useState(false);
    const [showDenyReasonInput, setShowDenyReasonInput] = React.useState(false);
    const [denyReason, setDenyReason] = React.useState('');
    // eslint-disable-next-line no-null/no-null
    const denyReasonInputRef = React.useRef<HTMLInputElement>(null);
    // eslint-disable-next-line no-null/no-null
    const allowButtonRef = React.useRef<HTMLDivElement>(null);
    // eslint-disable-next-line no-null/no-null
    const denyButtonRef = React.useRef<HTMLDivElement>(null);
    const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const DROPDOWN_HEIGHT = 120; // Estimated height of dropdown menu

    /**
     * Calculate whether dropdown should open above or below based on available space.
     * Checks the space between the button and the chat input widget.
     */
    const calculateDropdownDirection = React.useCallback((buttonRef: React.RefObject<HTMLDivElement>): 'above' | 'below' => {
        if (!buttonRef.current) {
            return 'below';
        }

        const buttonRect = buttonRef.current.getBoundingClientRect();

        // Find the chat input widget which marks the bottom boundary
        const chatInput = document.querySelector('.chat-input-widget');
        if (chatInput) {
            const inputRect = chatInput.getBoundingClientRect();
            const spaceBelow = inputRect.top - buttonRect.bottom;

            if (spaceBelow < DROPDOWN_HEIGHT) {
                return 'above';
            }
        }

        return 'below';
    }, []);

    const handleDropdownToggle = React.useCallback((type: 'allow' | 'deny') => {
        if (dropdownOpen === type) {
            setDropdownOpen(undefined);
        } else {
            const buttonRef = type === 'allow' ? allowButtonRef : denyButtonRef;
            const direction = calculateDropdownDirection(buttonRef);
            setDropdownDirection(direction);
            setDropdownOpen(type);
        }
    }, [dropdownOpen, calculateDropdownDirection]);

    const handleDropdownMouseLeave = React.useCallback(() => {
        closeTimeoutRef.current = setTimeout(() => {
            setDropdownOpen(undefined);
        }, 200);
    }, []);

    const handleDropdownMouseEnter = React.useCallback(() => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = undefined;
        }
    }, []);

    const handleAllow = React.useCallback(() => {
        // Check if we need extra confirmation for "Always Allow" or "Allow for this Chat" on confirmAlwaysAllow tools
        // Both modes enable auto-approval (session-scoped or permanent), so both require warning for dangerous tools
        if ((allowMode === 'forever' || allowMode === 'session') && toolRequest?.confirmAlwaysAllow) {
            setShowAlwaysAllowConfirmation(true);
            return;
        }
        onAllow(allowMode);
    }, [onAllow, allowMode, toolRequest]);

    const handleConfirmAlwaysAllow = React.useCallback(() => {
        setShowAlwaysAllowConfirmation(false);
        onAllow(allowMode);
    }, [onAllow, allowMode]);

    const handleCancelAlwaysAllow = React.useCallback(() => {
        setShowAlwaysAllowConfirmation(false);
    }, []);

    const handleDeny = React.useCallback(() => {
        onDeny(denyMode);
    }, [onDeny, denyMode]);

    const handleDenyWithReason = React.useCallback(() => {
        setShowDenyReasonInput(true);
        setDropdownOpen(undefined);
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

    // Focus the input when it becomes visible
    React.useEffect(() => {
        if (showDenyReasonInput && denyReasonInputRef.current) {
            denyReasonInputRef.current.focus();
        }
    }, [showDenyReasonInput]);

    const MODES: ToolConfirmationMode[] = ['once', 'session', 'forever'];

    const modeLabel = (type: 'allow' | 'deny', mode: ToolConfirmationMode): string => {
        if (type === 'allow') {
            switch (mode) {
                case 'once': return nls.localizeByDefault('Allow');
                case 'session': return nls.localize('theia/ai/chat-ui/toolconfirmation/allow-session', 'Allow for this Chat');
                case 'forever': return nls.localizeByDefault('Always Allow');
            }
        } else {
            switch (mode) {
                case 'once': return nls.localizeByDefault('Deny');
                case 'session': return nls.localize('theia/ai/chat-ui/toolconfirmation/deny-session', 'Deny for this Chat');
                case 'forever': return nls.localize('theia/ai/chat-ui/toolconfirmation/deny-forever', 'Always Deny');
            }
        }
    };

    const modeTooltip = (type: 'allow' | 'deny', mode: ToolConfirmationMode): string => {
        if (type === 'allow') {
            switch (mode) {
                case 'once': return nls.localize('theia/ai/chat-ui/toolconfirmation/allow-tooltip', 'Allow this tool call once');
                case 'session': return nls.localize('theia/ai/chat-ui/toolconfirmation/allow-session-tooltip', 'Allow all calls of this tool for this chat session');
                case 'forever': return nls.localize('theia/ai/chat-ui/toolconfirmation/allow-forever-tooltip', 'Always allow this tool');
            }
        } else {
            switch (mode) {
                case 'once': return nls.localize('theia/ai/chat-ui/toolconfirmation/deny-tooltip', 'Deny this tool call once');
                case 'session': return nls.localize('theia/ai/chat-ui/toolconfirmation/deny-session-tooltip', 'Deny all calls of this tool for this chat session');
                case 'forever': return nls.localize('theia/ai/chat-ui/toolconfirmation/deny-forever-tooltip', 'Always deny this tool');
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

    const renderSplitButton = (type: 'allow' | 'deny'): React.ReactNode => {
        const selectedMode = type === 'allow' ? allowMode : denyMode;
        const setMode = type === 'allow' ? setAllowMode : setDenyMode;
        const handleMain = type === 'allow' ? handleAllow : handleDeny;
        const buttonRef = type === 'allow' ? allowButtonRef : denyButtonRef;
        const otherModes = MODES.filter(m => m !== selectedMode);

        return (
            <div
                ref={buttonRef}
                className={`theia-tool-confirmation-split-button ${type}`}
                style={{ display: 'inline-flex', position: 'relative' }}
                onMouseEnter={handleDropdownMouseEnter}
                onMouseLeave={handleDropdownMouseLeave}
            >
                <button
                    className={`theia-button ${type === 'allow' ? 'main' : 'secondary'} theia-tool-confirmation-main-btn`}
                    onClick={handleMain}
                >
                    {modeLabel(type, selectedMode)}
                </button>
                <button
                    className={`theia-button ${type === 'allow' ? 'main' : 'secondary'} theia-tool-confirmation-chevron-btn`}
                    onClick={() => handleDropdownToggle(type)}
                    aria-haspopup="true"
                    aria-expanded={dropdownOpen === type}
                    tabIndex={0}
                    title={type === 'allow'
                        ? nls.localize('theia/ai/chat-ui/toolconfirmation/allow-options-dropdown-tooltip', 'More Allow Options')
                        : nls.localize('theia/ai/chat-ui/toolconfirmation/deny-options-dropdown-tooltip', 'More Deny Options')}
                >
                    <span className={codicon('chevron-down')}></span>
                </button>
                {dropdownOpen === type && (
                    <ul
                        className={`theia-tool-confirmation-dropdown-menu ${dropdownDirection}`}
                    >
                        {otherModes.map(mode => (
                            <li
                                key={mode}
                                className="theia-tool-confirmation-dropdown-item"
                                onClick={() => {
                                    setMode(mode);
                                    setDropdownOpen(undefined);
                                }}
                                title={modeTooltip(type, mode)}
                            >
                                {modeLabel(type, mode)}
                            </li>
                        ))}
                        {type === 'deny' && (
                            <>
                                <li className="theia-tool-confirmation-dropdown-divider" />
                                <li
                                    className="theia-tool-confirmation-dropdown-item"
                                    onClick={handleDenyWithReason}
                                    title={nls.localize('theia/ai/chat-ui/toolconfirmation/deny-with-reason-tooltip', 'Deny and provide a reason to the AI')}
                                >
                                    {nls.localize('theia/ai/chat-ui/toolconfirmation/deny-with-reason', 'Deny with reason...')}
                                </li>
                            </>
                        )}
                    </ul>
                )}
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
    onAllow: (mode?: ToolConfirmationMode) => void;
    onDeny: (mode?: ToolConfirmationMode, reason?: string) => void;
}

/**
 * Component that displays the generic tool confirmation UI with approval/denial buttons.
 * Shows tool name and standard Allow/Deny split buttons.
 *
 * For custom confirmation UIs that need to show tool-specific details (like command, arguments),
 * use ToolConfirmationActions directly with your own content wrapper.
 */
export const ToolConfirmation: React.FC<ToolConfirmationProps> = ({ response, toolRequest, onAllow, onDeny }) => {
    const [state, setState] = React.useState<ToolConfirmationState>('waiting');

    const handleAllow = React.useCallback((mode: ToolConfirmationMode) => {
        setState('allowed');
        onAllow(mode);
    }, [onAllow]);

    const handleDeny = React.useCallback((mode: ToolConfirmationMode, reason?: string) => {
        setState('denied');
        onDeny(mode, reason);
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
            />
        </div>
    );
};
