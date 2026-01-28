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

export type ToolConfirmationState = 'waiting' | 'allowed' | 'denied' | 'rejected';

export type ToolConfirmationMode = 'once' | 'session' | 'forever';

export interface ToolConfirmationCallbacks {
    toolRequest?: ToolRequest;
    onAllow: (mode: ToolConfirmationMode) => void;
    onDeny: (mode: ToolConfirmationMode, reason?: string) => void;
}

export interface ToolConfirmationActionsProps extends ToolConfirmationCallbacks {
    toolName: string;
    contextMenuRenderer: ContextMenuRenderer;
}

class InlineActionMenuNode implements CommandMenu {
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
    const [allowMode, setAllowMode] = React.useState<ToolConfirmationMode>('once');
    const [denyMode, setDenyMode] = React.useState<ToolConfirmationMode>('once');
    const [showAlwaysAllowConfirmation, setShowAlwaysAllowConfirmation] = React.useState(false);
    const [showDenyReasonInput, setShowDenyReasonInput] = React.useState(false);
    const [denyReason, setDenyReason] = React.useState('');
    // eslint-disable-next-line no-null/no-null
    const denyReasonInputRef = React.useRef<HTMLInputElement>(null);

    const handleAllow = React.useCallback(() => {
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
        selectedMode: ToolConfirmationMode,
        setMode: (mode: ToolConfirmationMode) => void
    ) => {
        const otherModes = MODES.filter(m => m !== selectedMode);
        const menu = new GroupImpl('tool-confirmation-dropdown');

        const modesGroup = new GroupImpl('modes', '1');
        otherModes.forEach((mode, index) => {
            modesGroup.addNode(new InlineActionMenuNode(
                `tool-confirmation-${type}-${mode}`,
                modeLabel(type, mode),
                () => setMode(mode),
                String(index)
            ));
        });
        menu.addNode(modesGroup);

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
    }, [contextMenuRenderer, handleDenyWithReason, modeLabel]);

    const renderSplitButton = (type: 'allow' | 'deny'): React.ReactNode => {
        const selectedMode = type === 'allow' ? allowMode : denyMode;
        const setMode = type === 'allow' ? setAllowMode : setDenyMode;
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
                    {modeLabel(type, selectedMode)}
                </button>
                <button
                    className={`theia-button ${type === 'allow' ? 'main' : 'secondary'} theia-tool-confirmation-chevron-btn`}
                    onClick={e => showDropdownMenu(e, type, selectedMode, setMode)}
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
    onAllow: (mode?: ToolConfirmationMode) => void;
    onDeny: (mode?: ToolConfirmationMode, reason?: string) => void;
    contextMenuRenderer: ContextMenuRenderer;
}

export const ToolConfirmation: React.FC<ToolConfirmationProps> = ({ response, toolRequest, onAllow, onDeny, contextMenuRenderer }) => {
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
                contextMenuRenderer={contextMenuRenderer}
            />
        </div>
    );
};
