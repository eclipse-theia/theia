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
import { nls } from '@theia/core';

interface GlobToolInput {
    pattern: string;
    path?: string;
}

@injectable()
export class GlobToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    canHandle(response: ChatResponseContent): number {
        if (ClaudeCodeToolCallChatResponseContent.is(response) && response.name === 'Glob') {
            return 15; // Higher than default ToolCallPartRenderer (10)
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        try {
            const input = JSON.parse(response.arguments || '{}') as GlobToolInput;
            return <GlobToolComponent
                input={input}
                workspaceService={this.workspaceService}
                labelProvider={this.labelProvider}
            />;
        } catch (error) {
            console.warn('Failed to parse Glob tool input:', error);
            return <div className="claude-code-tool error">{nls.localize('theia/ai/claude-code/failedToParseGlobToolData', 'Failed to parse Glob tool data')}</div>;
        }
    }
}

const GlobToolComponent: React.FC<{
    input: GlobToolInput;
    workspaceService: WorkspaceService;
    labelProvider: LabelProvider;
}> = ({ input, workspaceService, labelProvider }) => {
    const getSearchScope = (): string => {
        if (input.path) {
            return input.path.split('/').pop() || input.path;
        }
        return nls.localize('theia/ai/claude-code/project', 'project');
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

    const compactHeader = (
        <>
            <div className="claude-code-tool header-left">
                <span className="claude-code-tool title">{nls.localize('theia/ai/claude-code/finding', 'Finding')}</span>
                <span className={`${codicon('files')} claude-code-tool icon`} />
                <span className="claude-code-tool glob-pattern">{input.pattern}</span>
                <span className="claude-code-tool scope">{nls.localizeByDefault('in {0}', getSearchScope())}</span>
                {relativePath && <span className="claude-code-tool relative-path">{relativePath}</span>}
            </div>
            <div className="claude-code-tool header-right">
                <span className="claude-code-tool badge">{nls.localize('theia/ai/claude-code/globPattern', 'glob pattern')}</span>
            </div>
        </>
    );

    const expandedContent = (
        <div className="claude-code-tool details">
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">{nls.localize('theia/ai/claude-code/pattern', 'Pattern')}</span>
                <code className="claude-code-tool detail-value">{input.pattern}</code>
            </div>
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">{nls.localize('theia/ai/claude-code/searchPath', 'Search Path')}</span>
                <code className="claude-code-tool detail-value">{input.path || nls.localize('theia/ai/claude-code/currentDirectory', 'current directory')}</code>
            </div>
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">{nls.localizeByDefault('Description')}</span>
                <span className="claude-code-tool detail-value">
                    {input.path
                        ? nls.localize('theia/ai/claude-code/findMatchingFilesWithPath', 'Find files matching the glob pattern "{0}" within {1}', input.pattern, input.path)
                        : nls.localize('theia/ai/claude-code/findMatchingFiles', 'Find files matching the glob pattern "{0}" in the current directory', input.pattern)}
                </span>
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
