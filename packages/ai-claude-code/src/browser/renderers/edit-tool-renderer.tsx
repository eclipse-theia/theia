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
import { LabelProvider } from '@theia/core/lib/browser';
import { URI } from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import { EditorManager } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ClaudeCodeToolCallChatResponseContent } from '../claude-code-tool-call-content';
import { CollapsibleToolRenderer } from './collapsible-tool-renderer';

interface EditToolInput {
    file_path: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean;
}

@injectable()
export class EditToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    canHandle(response: ChatResponseContent): number {
        if (ClaudeCodeToolCallChatResponseContent.is(response) && response.name === 'Edit') {
            return 15; // Higher than default ToolCallPartRenderer (10)
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        try {
            const input = JSON.parse(response.arguments || '{}') as EditToolInput;
            return <EditToolComponent
                input={input}
                workspaceService={this.workspaceService}
                labelProvider={this.labelProvider}
                editorManager={this.editorManager}
            />;
        } catch (error) {
            console.warn('Failed to parse Edit tool input:', error);
            return <div className="claude-code-tool error">Failed to parse Edit tool data</div>;
        }
    }
}

const EditToolComponent: React.FC<{
    input: EditToolInput;
    workspaceService: WorkspaceService;
    labelProvider: LabelProvider;
    editorManager: EditorManager;
}> = ({ input, workspaceService, labelProvider, editorManager }) => {
    const getFileName = (filePath: string): string => filePath.split('/').pop() || filePath;
    const getWorkspaceRelativePath = async (filePath: string): Promise<string> => {
        try {
            const absoluteUri = new URI(filePath).parent;
            const workspaceRelativePath = await workspaceService.getWorkspaceRelativePath(absoluteUri);
            return workspaceRelativePath || '';
        } catch {
            return '';
        }
    };

    const getIcon = (filePath: string): string => {
        try {
            const uri = new URI(filePath);
            return labelProvider.getIcon(uri) || 'codicon-file';
        } catch {
            return 'codicon-file';
        }
    };

    const handleOpenFile = async () => {
        try {
            const uri = new URI(input.file_path);
            await editorManager.open(uri);
        } catch (error) {
            console.error('Failed to open file:', error);
        }
    };

    const [relativePath, setRelativePath] = React.useState<string>('');

    React.useEffect(() => {
        getWorkspaceRelativePath(input.file_path).then(setRelativePath);
    }, [input.file_path]);

    const getChangeInfo = () => {
        const oldLines = input.old_string.split('\n').length;
        const newLines = input.new_string.split('\n').length;
        return { oldLines, newLines };
    };

    const compactHeader = (
        <>
            <div className="claude-code-tool header-left">
                <span className="claude-code-tool title">Editing</span>
                <span className={`${getIcon(input.file_path)} claude-code-tool icon`} />
                <span
                    className="claude-code-tool file-name clickable-element"
                    onClick={handleOpenFile}
                    title="Click to open file in editor"
                >
                    {getFileName(input.file_path)}
                </span>
                {relativePath && <span className="claude-code-tool relative-path" title={relativePath}>{relativePath}</span>}
            </div>
            <div className="claude-code-tool header-right">
                <span className="claude-code-tool badge deleted">-{getChangeInfo().oldLines}</span>
                <span className="claude-code-tool badge added">+{getChangeInfo().newLines}</span>
                {input.replace_all && (
                    <span className="claude-code-tool badge">Replace All</span>
                )}
            </div>
        </>
    );

    const expandedContent = (
        <div className="claude-code-tool details">
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">File Path:</span>
                <code className="claude-code-tool detail-value">{input.file_path}</code>
            </div>
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">Old Text:</span>
                <pre className="claude-code-tool detail-value code-preview">
                    {input.old_string.length > 200
                        ? input.old_string.substring(0, 200) + '...'
                        : input.old_string}
                </pre>
            </div>
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">New Text:</span>
                <pre className="claude-code-tool detail-value code-preview">
                    {input.new_string.length > 200
                        ? input.new_string.substring(0, 200) + '...'
                        : input.new_string}
                </pre>
            </div>
            {input.replace_all && (
                <div className="claude-code-tool detail-row">
                    <span className="claude-code-tool detail-label">Mode:</span>
                    <span className="claude-code-tool detail-value">Replace all occurrences</span>
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
