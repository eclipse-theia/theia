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

import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';
import { ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';

/**
 * States the tool confirmation component can be in
 */
export enum ToolConfirmationState {
    WAITING = 'waiting',
    APPROVED = 'approved',
    DENIED = 'denied'
}

export interface ToolConfirmationProps {
    response: ToolCallChatResponseContent;
    onApprove: () => void;
    onDeny: () => void;
}

/**
 * Component that displays approval/denial buttons for tool execution
 */
export const ToolConfirmation: React.FC<ToolConfirmationProps> = ({ response, onApprove, onDeny }) => {
    const [state, setState] = React.useState<ToolConfirmationState>(ToolConfirmationState.WAITING);

    // Format arguments for display
    const prettyArgs = React.useMemo(() => {
        if (!response.arguments) {
            return '{}';
        }
        try {
            return JSON.stringify(JSON.parse(response.arguments), undefined, 2);
        } catch (e) {
            return response.arguments;
        }
    }, [response.arguments]);

    const handleApprove = React.useCallback(() => {
        setState(ToolConfirmationState.APPROVED);
        onApprove();
    }, [onApprove]);

    const handleDeny = React.useCallback(() => {
        setState(ToolConfirmationState.DENIED);
        onDeny();
    }, [onDeny]);

    if (state === ToolConfirmationState.APPROVED) {
        return (
            <div className="theia-tool-confirmation-status approved">
                <i className="fa fa-check-circle"></i> {nls.localize('theia/ai/chat-ui/toolconfirmation/approved', 'Tool execution approved')}
            </div>
        );
    }

    if (state === ToolConfirmationState.DENIED) {
        return (
            <div className="theia-tool-confirmation-status denied">
                <i className="fa fa-times-circle"></i> {nls.localize('theia/ai/chat-ui/toolconfirmation/denied', 'Tool execution denied')}
            </div>
        );
    }

    return (
        <div className="theia-tool-confirmation">
            <div className="theia-tool-confirmation-header">
                <i className="fa fa-shield-alt"></i> {nls.localize('theia/ai/chat-ui/toolconfirmation/header', 'Confirm Tool Execution')}
            </div>
            <div className="theia-tool-confirmation-info">
                <div className="theia-tool-confirmation-name">
                    <span className="label">{nls.localize('theia/ai/chat-ui/toolconfirmation/tool', 'Tool')}:</span>
                    <span className="value">{response.name}</span>
                </div>
                {response.arguments && (
                    <div className="theia-tool-confirmation-args">
                        <span className="label">{nls.localize('theia/ai/chat-ui/toolconfirmation/arguments', 'Arguments')}:</span>
                        <pre className="value">{prettyArgs}</pre>
                    </div>
                )}
            </div>
            <div className="theia-tool-confirmation-actions">
                <button className="theia-button secondary" onClick={handleDeny}>
                    {nls.localize('theia/ai/chat-ui/toolconfirmation/deny', 'Deny')}
                </button>
                <button className="theia-button primary" onClick={handleApprove}>
                    {nls.localize('theia/ai/chat-ui/toolconfirmation/approve', 'Approve')}
                </button>
            </div>
        </div>
    );
};
