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

import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { ResponseNode } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { ChatResponseContent, ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { codicon } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import { ClaudeCodeToolCallChatResponseContent } from '../claude-code-tool-call-content';
import { CollapsibleToolRenderer } from './collapsible-tool-renderer';

interface BashToolInput {
    command: string;
    description?: string;
    timeout?: number;
}

@injectable()
export class BashToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    canHandle(response: ChatResponseContent): number {
        if (ClaudeCodeToolCallChatResponseContent.is(response) && response.name === 'Bash') {
            return 15; // Higher than default ToolCallPartRenderer (10)
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        try {
            const input = JSON.parse(response.arguments || '{}') as BashToolInput;
            return <BashToolComponent input={input} />;
        } catch (error) {
            console.warn('Failed to parse Bash tool input:', error);
            return <div className="claude-code-tool error">Failed to parse Bash tool data</div>;
        }
    }
}

const BashToolComponent: React.FC<{
    input: BashToolInput;
}> = ({ input }) => {
    const compactHeader = (
        <>
            <div className="claude-code-tool header-left">
                <span className="claude-code-tool title">Terminal</span>
                <span className={`${codicon('terminal')} claude-code-tool icon`} />
                <span className="claude-code-tool command">{input.command}</span>
            </div>
            <div className="claude-code-tool header-right">
                {input.timeout && (
                    <span className="claude-code-tool badge">Timeout: {input.timeout}ms</span>
                )}
            </div>
        </>
    );

    const expandedContent = input.description ? (
        <div className="claude-code-tool details">
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">Command</span>
                <code className="claude-code-tool detail-value">{input.command}</code>
            </div>
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">Description</span>
                <span className="claude-code-tool detail-value">{input.description}</span>
            </div>
            {input.timeout && (
                <div className="claude-code-tool detail-row">
                    <span className="claude-code-tool detail-label">Timeout</span>
                    <span className="claude-code-tool detail-value">{input.timeout}ms</span>
                </div>
            )}
        </div>
    ) : undefined;

    return (
        <CollapsibleToolRenderer
            compactHeader={compactHeader}
            expandedContent={expandedContent}
        />
    );
};
