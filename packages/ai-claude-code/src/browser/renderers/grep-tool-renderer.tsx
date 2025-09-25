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
import { codicon, LabelProvider } from '@theia/core/lib/browser';
import { URI } from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ClaudeCodeToolCallChatResponseContent } from '../claude-code-tool-call-content';
import { CollapsibleToolRenderer } from './collapsible-tool-renderer';

interface GrepToolInput {
    pattern: string;
    path?: string;
    output_mode?: 'content' | 'files_with_matches' | 'count';
    glob?: string;
    type?: string;
    '-i'?: boolean;
    '-n'?: boolean;
    '-A'?: number;
    '-B'?: number;
    '-C'?: number;
    multiline?: boolean;
    head_limit?: number;
}

@injectable()
export class GrepToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    canHandle(response: ChatResponseContent): number {
        if (ClaudeCodeToolCallChatResponseContent.is(response) && response.name === 'Grep') {
            return 15; // Higher than default ToolCallPartRenderer (10)
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        try {
            const input = JSON.parse(response.arguments || '{}') as GrepToolInput;
            return <GrepToolComponent
                input={input}
                workspaceService={this.workspaceService}
                labelProvider={this.labelProvider}
            />;
        } catch (error) {
            console.warn('Failed to parse Grep tool input:', error);
            return <div className="claude-code-tool error">Failed to parse Grep tool data</div>;
        }
    }
}

const GrepToolComponent: React.FC<{
    input: GrepToolInput;
    workspaceService: WorkspaceService;
    labelProvider: LabelProvider;
}> = ({ input, workspaceService, labelProvider }) => {
    const getSearchScope = (): string => {
        if (input.path) {
            return input.path.split('/').pop() || input.path;
        }
        return 'project';
    };

    const getWorkspaceRelativePath = async (filePath: string): Promise<string> => {
        try {
            const absoluteUri = new URI(filePath);
            const workspaceRelativePath = await workspaceService.getWorkspaceRelativePath(absoluteUri);
            return workspaceRelativePath || '';
        } catch {
            return '';
        }
    };

    const [relativePath, setRelativePath] = React.useState<string>('');

    React.useEffect(() => {
        if (input.path) {
            getWorkspaceRelativePath(input.path).then(setRelativePath);
        }
    }, [input.path]);

    const getOptionsInfo = (): { label: string; count: number } => {
        const options = [];
        if (input['-i']) { options.push('case-insensitive'); }
        if (input['-n']) { options.push('line numbers'); }
        if (input['-A']) { options.push(`+${input['-A']} after`); }
        if (input['-B']) { options.push(`+${input['-B']} before`); }
        if (input['-C']) { options.push(`±${input['-C']} context`); }
        if (input.multiline) { options.push('multiline'); }
        if (input.glob) { options.push(`glob: ${input.glob}`); }
        if (input.type) { options.push(`type: ${input.type}`); }
        if (input.head_limit) { options.push(`limit: ${input.head_limit}`); }

        return {
            label: options.length > 0 ? options.join(', ') : '',
            count: options.length
        };
    };

    const optionsInfo = getOptionsInfo();

    const compactHeader = (
        <>
            <div className="claude-code-tool header-left">
                <span className="claude-code-tool title">Searching</span>
                <span className={`${codicon('search')} claude-code-tool icon`} />
                <span className="claude-code-tool pattern">"{input.pattern}"</span>
                <span className="claude-code-tool scope">in {getSearchScope()}</span>
                {relativePath && <span className="claude-code-tool relative-path">{relativePath}</span>}
            </div>
            <div className="claude-code-tool header-right">
                {input.output_mode && input.output_mode !== 'files_with_matches' && (
                    <span className="claude-code-tool badge">{input.output_mode}</span>
                )}
                {optionsInfo.count > 0 && (
                    <span className="claude-code-tool badge" title={optionsInfo.label}>
                        {optionsInfo.count} option{optionsInfo.count > 1 ? 's' : ''}
                    </span>
                )}
            </div>
        </>
    );

    const expandedContent = (
        <div className="claude-code-tool details">
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">Pattern:</span>
                <code className="claude-code-tool detail-value">"{input.pattern}"</code>
            </div>
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">Search Path:</span>
                <code className="claude-code-tool detail-value">{input.path || 'project root'}</code>
            </div>
            {input.output_mode && (
                <div className="claude-code-tool detail-row">
                    <span className="claude-code-tool detail-label">Output Mode:</span>
                    <span className="claude-code-tool detail-value">{input.output_mode}</span>
                </div>
            )}
            {input.glob && (
                <div className="claude-code-tool detail-row">
                    <span className="claude-code-tool detail-label">File Filter:</span>
                    <code className="claude-code-tool detail-value">{input.glob}</code>
                </div>
            )}
            {input.type && (
                <div className="claude-code-tool detail-row">
                    <span className="claude-code-tool detail-label">File Type:</span>
                    <span className="claude-code-tool detail-value">{input.type}</span>
                </div>
            )}
            {optionsInfo.label && (
                <div className="claude-code-tool detail-row">
                    <span className="claude-code-tool detail-label">Options:</span>
                    <span className="claude-code-tool detail-value">{optionsInfo.label}</span>
                </div>
            )}
        </div>
    );

    return (
        <CollapsibleToolRenderer
            compactHeader={compactHeader}
            expandedContent={expandedContent}
        />
    );
};
