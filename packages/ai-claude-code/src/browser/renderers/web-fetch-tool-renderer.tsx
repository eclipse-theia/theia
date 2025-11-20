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
import { nls } from '@theia/core';

interface WebFetchToolInput {
    url: string;
    prompt: string;
}

@injectable()
export class WebFetchToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    canHandle(response: ChatResponseContent): number {
        if (ClaudeCodeToolCallChatResponseContent.is(response) && response.name === 'WebFetch') {
            return 15; // Higher than default ToolCallPartRenderer (10)
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        try {
            const input = JSON.parse(response.arguments || '{}') as WebFetchToolInput;
            return <WebFetchToolComponent input={input} />;
        } catch (error) {
            console.warn('Failed to parse WebFetch tool input:', error);
            return <div className="claude-code-tool error">{nls.localize('theia/ai/claude-code/failedToParseWebFetchToolData', 'Failed to parse WebFetch tool data')}</div>;
        }
    }
}

const WebFetchToolComponent: React.FC<{
    input: WebFetchToolInput;
}> = ({ input }) => {
    const getDomain = (url: string): string => {
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    };

    const truncatePrompt = (prompt: string, maxLength: number = 100): string => {
        if (prompt.length <= maxLength) { return prompt; }
        return prompt.substring(0, maxLength) + '...';
    };

    const compactHeader = (
        <>
            <div className="claude-code-tool header-left">
                <span className="claude-code-tool title">{nls.localize('theia/ai/claude-code/fetching', 'Fetching')}</span>
                <span className={`${codicon('globe')} claude-code-tool icon`} />
                <span className="claude-code-tool command">{getDomain(input.url)}</span>
                <span className="claude-code-tool description" title={input.prompt}>
                    {truncatePrompt(input.prompt)}
                </span>
            </div>
            <div className="claude-code-tool header-right">
                <span className="claude-code-tool badge">{nls.localize('theia/ai/claude-code/webFetch', 'Web Fetch')}</span>
            </div>
        </>
    );

    const expandedContent = (
        <div className="claude-code-tool details">
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">{nls.localize('theia/ai/claude-code/url', 'URL')}</span>
                <code className="claude-code-tool detail-value">{input.url}</code>
            </div>
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">{nls.localize('theia/ai/claude-code/domain', 'Domain')}</span>
                <span className="claude-code-tool detail-value">{getDomain(input.url)}</span>
            </div>
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">{nls.localizeByDefault('Prompt')}</span>
                <span className="claude-code-tool detail-value">{input.prompt}</span>
            </div>
        </div>
    );

    return (
        <CollapsibleToolRenderer
            compactHeader={compactHeader}
            expandedContent={expandedContent}
        />
    );
};
