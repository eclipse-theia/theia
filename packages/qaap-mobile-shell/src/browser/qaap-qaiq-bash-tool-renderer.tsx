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

interface BashToolInput {
    readonly command: string;
    readonly description?: string;
    readonly timeout?: number;
}

/** Bash tools from QAIQ stream-json — collapsible header + command output (Codex-style). */
@injectable()
export class QaapQaiqBashToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    canHandle(response: ChatResponseContent): number {
        if (!ClaudeCodeToolCallChatResponseContent.is(response)) {
            return -1;
        }
        const name = response.name?.toLowerCase();
        return name === 'bash' ? 16 : -1;
    }

    render(response: ToolCallChatResponseContent): ReactNode {
        try {
            const input = JSON.parse(response.arguments || '{}') as BashToolInput;
            return <QaapBashToolComponent input={input} response={response} />;
        } catch (error) {
            console.warn('QaapQaiqBashToolRenderer: failed to parse Bash input:', error);
            return <div className="claude-code-tool error">Bash</div>;
        }
    }
}

const QaapBashToolComponent: React.FC<{
    input: BashToolInput;
    response: ToolCallChatResponseContent;
}> = ({ input, response }) => {
    const output = response.finished ? formatToolResult(response.result) : undefined;
    const hasExpandable = !!(input.description || output);

    const compactHeader = (
        <>
            <div className="claude-code-tool header-left">
                <span className="claude-code-tool title">{nls.localizeByDefault('Terminal')}</span>
                <span className={`${codicon('terminal')} claude-code-tool icon`} />
                <span className="claude-code-tool command">{input.command}</span>
            </div>
            <div className="claude-code-tool header-right">
                {response.finished && output && (
                    <span className={`claude-code-tool badge ${output.includes('Error') ? 'deleted' : ''}`}>
                        {output.includes('Error') ? nls.localizeByDefault('Failed') : nls.localizeByDefault('Done')}
                    </span>
                )}
                {!response.finished && (
                    <span className={`${codicon('loading')} claude-code-tool icon theia-animation-spin`} />
                )}
            </div>
        </>
    );

    const expandedContent = hasExpandable ? (
        <div className="claude-code-tool details">
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">{nls.localizeByDefault('Command')}</span>
                <code className="claude-code-tool detail-value">{input.command}</code>
            </div>
            {input.description && (
                <div className="claude-code-tool detail-row">
                    <span className="claude-code-tool detail-label">{nls.localizeByDefault('Description')}</span>
                    <span className="claude-code-tool detail-value">{input.description}</span>
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
};

