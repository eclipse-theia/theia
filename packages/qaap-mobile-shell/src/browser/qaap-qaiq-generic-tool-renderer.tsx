// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { ChatResponseContent, ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { ClaudeCodeToolCallChatResponseContent } from '@theia/ai-claude-code/lib/browser/claude-code-tool-call-content';
import { CollapsibleToolRenderer } from '@theia/ai-claude-code/lib/browser/renderers/collapsible-tool-renderer';
import { codicon } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import { formatToolResult } from './qaap-qaiq-tool-renderer-utils';

/** Tool names handled by a dedicated renderer — the generic one defers to them. */
const DEDICATED_TOOL_RENDERERS = new Set(['bash', 'read', 'edit', 'write', 'grep', 'glob', 'ls', 'multiedit', 'webfetch', 'todowrite']);

/** QAIQ tools without a dedicated Claude Code renderer — collapsible args + output. */
@injectable()
export class QaapQaiqGenericToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    canHandle(response: ChatResponseContent): number {
        if (!ClaudeCodeToolCallChatResponseContent.is(response) || !response.name) {
            return -1;
        }
        if (DEDICATED_TOOL_RENDERERS.has(response.name.toLowerCase())) {
            return -1;
        }
        return 13;
    }

    render(response: ToolCallChatResponseContent): ReactNode {
        const output = response.finished ? formatToolResult(response.result) : undefined;
        const args = response.arguments?.trim();
        const hasExpandable = !!(args && args !== '{}' || output);

        const compactHeader = (
            <>
                <div className="claude-code-tool header-left">
                    <span className="claude-code-tool title">{response.name}</span>
                    <span className={`${codicon('tools')} claude-code-tool icon`} />
                    {!response.finished && (
                        <span className={`${codicon('loading')} claude-code-tool icon theia-animation-spin`} />
                    )}
                </div>
                <div className="claude-code-tool header-right">
                    {response.finished && (
                        <span className="claude-code-tool badge">
                            {output?.includes('Error') ? nls.localizeByDefault('Failed') : nls.localizeByDefault('Done')}
                        </span>
                    )}
                </div>
            </>
        );

        const expandedContent = hasExpandable ? (
            <div className="claude-code-tool details">
                {args && args !== '{}' && (
                    <div className="claude-code-tool detail-row">
                        <span className="claude-code-tool detail-label">{nls.localizeByDefault('Input')}</span>
                        <pre className="claude-code-tool detail-value code-preview">{args}</pre>
                    </div>
                )}
                {output && (
                    <div className="claude-code-tool detail-row">
                        <span className="claude-code-tool detail-label">{nls.localizeByDefault('Output')}</span>
                        <pre className="claude-code-tool detail-value code-preview">{output}</pre>
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
    }
}

