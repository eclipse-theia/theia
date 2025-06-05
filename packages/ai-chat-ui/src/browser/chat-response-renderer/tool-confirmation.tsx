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

/**
 * States the tool confirmation component can be in
 */
export type ToolConfirmationState = 'waiting' | 'allowed' | 'denied';

export interface ToolConfirmationProps {
    response: ToolCallChatResponseContent;
    onAllow: (mode?: 'once' | 'session' | 'forever') => void;
    onDeny: (mode?: 'once' | 'session' | 'forever') => void;
}

/**
 * Component that displays approval/denial buttons for tool execution
 */
export const ToolConfirmation: React.FC<ToolConfirmationProps> = ({ response, onAllow, onDeny }) => {
    const [state, setState] = React.useState<ToolConfirmationState>('waiting');
    // Track selected mode for each action
    const [allowMode, setAllowMode] = React.useState<'once' | 'session' | 'forever'>('once');
    const [denyMode, setDenyMode] = React.useState<'once' | 'session' | 'forever'>('once');
    const [dropdownOpen, setDropdownOpen] = React.useState<'allow' | 'deny' | undefined>(undefined);

    const handleAllow = React.useCallback(() => {
        setState('allowed');
        onAllow(allowMode);
    }, [onAllow, allowMode]);

    const handleDeny = React.useCallback(() => {
        setState('denied');
        onDeny(denyMode);
    }, [onDeny, denyMode]);

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

    // Helper for dropdown options
    const MODES: Array<'once' | 'session' | 'forever'> = ['once', 'session', 'forever'];
    // Unified labels for both main button and dropdown, as requested
    const modeLabel = (type: 'allow' | 'deny', mode: 'once' | 'session' | 'forever') => {
        if (type === 'allow') {
            switch (mode) {
                case 'once': return nls.localize('theia/ai/chat-ui/toolconfirmation/allow', 'Allow');
                case 'session': return nls.localize('theia/ai/chat-ui/toolconfirmation/allow-session', 'Allow for this Chat');
                case 'forever': return nls.localize('theia/ai/chat-ui/toolconfirmation/allow-forever', 'Always Allow');
            }
        } else {
            switch (mode) {
                case 'once': return nls.localize('theia/ai/chat-ui/toolconfirmation/deny', 'Deny');
                case 'session': return nls.localize('theia/ai/chat-ui/toolconfirmation/deny-session', 'Deny for this Chat');
                case 'forever': return nls.localize('theia/ai/chat-ui/toolconfirmation/deny-forever', 'Always Deny');
            }
        }
    };
    // Main button label is always the same as the dropdown label for the selected mode
    const mainButtonLabel = modeLabel; // Use the same function for both

    // Tooltips for dropdown options
    const modeTooltip = (type: 'allow' | 'deny', mode: 'once' | 'session' | 'forever') => {
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

    // Split button for approve/deny
    const renderSplitButton = (type: 'allow' | 'deny') => {
        const selectedMode = type === 'allow' ? allowMode : denyMode;
        const setMode = type === 'allow' ? setAllowMode : setDenyMode;
        const handleMain = type === 'allow' ? handleAllow : handleDeny;
        const otherModes = MODES.filter(m => m !== selectedMode);
        return (
            <div className={`theia-tool-confirmation-split-button ${type}`}
                style={{ display: 'inline-flex', position: 'relative' }}>
                <button
                    className={`theia-button ${type === 'allow' ? 'primary' : 'secondary'} theia-tool-confirmation-main-btn`}
                    onClick={handleMain}
                >
                    {mainButtonLabel(type, selectedMode)}
                </button>
                <button
                    className={`theia-button ${type === 'allow' ? 'primary' : 'secondary'} theia-tool-confirmation-chevron-btn`}
                    onClick={() => setDropdownOpen(dropdownOpen === type ? undefined : type)}
                    aria-haspopup="true"
                    aria-expanded={dropdownOpen === type}
                    tabIndex={0}
                    title={type === 'allow' ? 'More Allow Options' : 'More Deny Options'}
                >
                    <span className={codicon('chevron-down')}></span>
                </button>
                {dropdownOpen === type && (
                    <ul
                        className="theia-tool-confirmation-dropdown-menu"
                        onMouseLeave={() => setDropdownOpen(undefined)}
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
                    </ul>
                )}
            </div>
        );
    };

    return (
        <div className="theia-tool-confirmation">
            <div className="theia-tool-confirmation-header">
                <span className={codicon('shield')}></span> {nls.localize('theia/ai/chat-ui/toolconfirmation/header', 'Confirm Tool Execution')}
            </div>
            <div className="theia-tool-confirmation-info">
                <div className="theia-tool-confirmation-name">
                    <span className="label">{nls.localize('theia/ai/chat-ui/toolconfirmation/tool', 'Tool')}:</span>
                    <span className="value">{response.name}</span>
                </div>
            </div>
            <div className="theia-tool-confirmation-actions">
                {renderSplitButton('deny')}
                {renderSplitButton('allow')}
            </div>
        </div>
    );
};
