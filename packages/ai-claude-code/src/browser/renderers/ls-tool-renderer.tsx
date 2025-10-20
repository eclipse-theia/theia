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
import { EditorManager } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ClaudeCodeToolCallChatResponseContent } from '../claude-code-tool-call-content';
import { CollapsibleToolRenderer } from './collapsible-tool-renderer';
import { nls } from '@theia/core';

interface LSToolInput {
    path: string;
    ignore?: string[];
}

@injectable()
export class LSToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    canHandle(response: ChatResponseContent): number {
        if (ClaudeCodeToolCallChatResponseContent.is(response) && response.name === 'LS') {
            return 15; // Higher than default ToolCallPartRenderer (10)
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        try {
            const input = JSON.parse(response.arguments || '{}') as LSToolInput;
            return <LSToolComponent
                input={input}
                workspaceService={this.workspaceService}
                labelProvider={this.labelProvider}
                editorManager={this.editorManager}
            />;
        } catch (error) {
            console.warn('Failed to parse LS tool input:', error);
            return <div className="claude-code-tool error">{nls.localize('theia/ai/claude-code/failedToParseLSToolData', 'Failed to parse LS tool data')}</div>;
        }
    }
}

const LSToolComponent: React.FC<{
    input: LSToolInput;
    workspaceService: WorkspaceService;
    labelProvider: LabelProvider;
    editorManager: EditorManager;
}> = ({ input, workspaceService, labelProvider, editorManager }) => {
    const getDirectoryName = (dirPath: string): string => dirPath.split('/').pop() || dirPath;
    const getWorkspaceRelativePath = async (dirPath: string): Promise<string> => {
        try {
            const absoluteUri = new URI(dirPath);
            const workspaceRelativePath = await workspaceService.getWorkspaceRelativePath(absoluteUri);
            return workspaceRelativePath || '';
        } catch {
            return '';
        }
    };

    const handleOpenDirectory = async () => {
        try {
            const uri = new URI(input.path);
            // Note: This might need to be adjusted based on how directories are opened in Theia
            await editorManager.open(uri);
        } catch (error) {
            console.error('Failed to open directory:', error);
        }
    };

    const [relativePath, setRelativePath] = React.useState<string>('');

    React.useEffect(() => {
        getWorkspaceRelativePath(input.path).then(setRelativePath);
    }, [input.path]);

    const compactHeader = (
        <>
            <div className="claude-code-tool header-left">
                <span className="claude-code-tool title">{nls.localize('theia/ai/claude-code/listing', 'Listing')}</span>
                <span className={`${codicon('checklist')} claude-code-tool icon`} />
                <span
                    className="claude-code-tool file-name clickable-element"
                    onClick={handleOpenDirectory}
                    title={nls.localize('theia/ai/claude-code/openDirectoryTooltip', 'Click to open directory')}
                >
                    {getDirectoryName(input.path)}
                </span>
                {relativePath && <span className="claude-code-tool relative-path">{relativePath}</span>}
            </div>
            <div className="claude-code-tool header-right">
                {input.ignore && input.ignore.length > 0 && (
                    <span className="claude-code-tool badge">{nls.localize('theia/ai/claude-code/ignoringPatterns', 'Ignoring {0} patterns', input.ignore.length)}</span>
                )}
            </div>
        </>
    );

    const expandedContent = (
        <div className="claude-code-tool details">
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">{nls.localize('theia/ai/claude-code/directory', 'Directory')}</span>
                <code className="claude-code-tool detail-value">{input.path}</code>
            </div>
            {input.ignore && input.ignore.length > 0 && (
                <div className="claude-code-tool detail-row">
                    <span className="claude-code-tool detail-label">{nls.localize('theia/ai/claude-code/ignoredPatterns', 'Ignored Patterns')}</span>
                    <div className="claude-code-tool detail-value">
                        {input.ignore.map((pattern, index) => (
                            <code key={index} className="claude-code-tool ignore-pattern">
                                {pattern}{index < input.ignore!.length - 1 ? ', ' : ''}
                            </code>
                        ))}
                    </div>
                </div>
            )}
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">{nls.localizeByDefault('Description')}</span>
                <span className="claude-code-tool detail-value">
                    {nls.localize('theia/ai/claude-code/listDirectoryContents', 'List directory contents')}{input.ignore && input.ignore.length > 0
                        ? (input.ignore.length > 1
                            ? nls.localize('theia/ai/claude-code/excludingPatterns', ' (excluding {0} patterns)', input.ignore.length)
                            : nls.localize('theia/ai/claude-code/excludingOnePattern', ' (exluding 1 pattern)'))
                        : ''}
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
