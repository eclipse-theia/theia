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

import { ChatResponseContent } from '@theia/ai-chat';
import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { codicon } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import type { CommandExecutionItem } from '@openai/codex-sdk';
import { CodexToolCallChatResponseContent } from '../codex-tool-call-content';
import { nls } from '@theia/core';

@injectable()
export class CommandExecutionRenderer implements ChatResponsePartRenderer<CodexToolCallChatResponseContent> {
    canHandle(response: ChatResponseContent): number {
        return response.kind === 'toolCall' &&
            (response as CodexToolCallChatResponseContent).name === 'command_execution'
            ? 100
            : 0;
    }

    render(content: CodexToolCallChatResponseContent): ReactNode {
        let item: CommandExecutionItem | undefined;

        if (content.result) {
            try {
                item = typeof content.result === 'string'
                    ? JSON.parse(content.result)
                    : content.result as CommandExecutionItem;
            } catch (error) {
                console.error('Failed to parse command execution result:', error);
                return undefined;
            }
        }

        if (!item) {
            const args = content.arguments ? JSON.parse(content.arguments) : {};
            return <CommandExecutionInProgressComponent command={args.command || 'executing...'} />;
        }

        return <CommandExecutionComponent item={item} />;
    }
}

const CommandExecutionInProgressComponent: React.FC<{
    command: string;
}> = ({ command }) => (
    <div className="codex-command-execution">
        <div className="codex-tool-header">
            <span className={`${codicon('loading')} codex-tool-icon codex-loading`}></span>
            <span className="codex-tool-name">{nls.localizeByDefault('Terminal')}</span>
            <code className="codex-command-line">{command}</code>
            <span className="codex-exit-code in-progress">
                {nls.localize('theia/ai/codex/running', 'Running...')}
            </span>
        </div>
    </div>
);

const CommandExecutionComponent: React.FC<{
    item: CommandExecutionItem;
}> = ({ item }) => {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const success = item.exit_code === 0;

    const hasOutput = item.aggregated_output && item.aggregated_output.trim().length > 0;

    return (
        <div className="codex-command-execution">
            <div
                className={`codex-tool-header${hasOutput ? ' expandable' : ''}`}
                onClick={() => hasOutput && setIsExpanded(!isExpanded)}
                style={{ cursor: hasOutput ? 'pointer' : 'default' }}
            >
                {hasOutput && (
                    <span className={`${codicon(isExpanded ? 'chevron-down' : 'chevron-right')} codex-expand-icon`} />
                )}
                <span className={`${codicon('terminal')} codex-tool-icon`}></span>
                <span className="codex-tool-name">{nls.localizeByDefault('Terminal')}</span>
                <code className="codex-command-line">{item.command}</code>
                <span className={`codex-exit-code ${success ? 'success' : 'error'}`}>
                    {nls.localize('theia/ai/codex/exitCode', 'Exit code: {0}', item.exit_code)}
                </span>
            </div>
            {hasOutput && isExpanded && (
                <pre className="codex-command-output">{item.aggregated_output}</pre>
            )}
        </div>
    );
};
