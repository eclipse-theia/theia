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

interface EditOperation {
    old_string: string;
    new_string: string;
    replace_all?: boolean;
}

interface MultiEditToolInput {
    file_path: string;
    edits: EditOperation[];
}

@injectable()
export class MultiEditToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    canHandle(response: ChatResponseContent): number {
        if (ClaudeCodeToolCallChatResponseContent.is(response) && response.name === 'MultiEdit') {
            return 15; // Higher than default ToolCallPartRenderer (10)
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        try {
            const input = JSON.parse(response.arguments || '{}') as MultiEditToolInput;
            return <MultiEditToolComponent
                input={input}
                workspaceService={this.workspaceService}
                labelProvider={this.labelProvider}
                editorManager={this.editorManager}
            />;
        } catch (error) {
            console.warn('Failed to parse MultiEdit tool input:', error);
            return <div className="claude-code-tool error">Failed to parse MultiEdit tool data</div>;
        }
    }
}

const MultiEditToolComponent: React.FC<{
    input: MultiEditToolInput;
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
        let totalOldLines = 0;
        let totalNewLines = 0;

        input.edits.forEach(edit => {
            totalOldLines += edit.old_string.split('\n').length;
            totalNewLines += edit.new_string.split('\n').length;
        });

        return { totalOldLines, totalNewLines };
    };

    const replaceAllCount = input.edits.filter(edit => edit.replace_all).length;
    const totalEdits = input.edits.length;

    const compactHeader = (
        <>
            <div className="claude-code-tool header-left">
                <span className="claude-code-tool title">Multi-editing</span>
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
                <span className="claude-code-tool badge deleted">-{getChangeInfo().totalOldLines}</span>
                <span className="claude-code-tool badge added">+{getChangeInfo().totalNewLines}</span>
                <span className="claude-code-tool badge">{totalEdits} edit{totalEdits !== 1 ? 's' : ''}</span>
                {replaceAllCount > 0 && (
                    <span className="claude-code-tool badge">{replaceAllCount} replace-all</span>
                )}
            </div>
        </>
    );

    const expandedContent = (
        <div className="claude-code-tool details">
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">File Path</span>
                <code className="claude-code-tool detail-value">{input.file_path}</code>
            </div>
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">Total Edits</span>
                <span className="claude-code-tool detail-value">{totalEdits}</span>
            </div>
            {input.edits.map((edit, index) => (
                <div key={index} className="claude-code-tool edit-preview">
                    <div className="claude-code-tool edit-preview-header">
                        <span className="claude-code-tool edit-preview-title">Edit {index + 1}</span>
                        {edit.replace_all && (
                            <span className="claude-code-tool edit-preview-badge">
                                Replace all
                            </span>
                        )}
                    </div>
                    <div className="claude-code-tool detail-row">
                        <span className="claude-code-tool detail-label">From</span>
                        <pre className="claude-code-tool detail-value code-preview">
                            {edit.old_string.length > 100
                                ? edit.old_string.substring(0, 100) + '...'
                                : edit.old_string}
                        </pre>
                    </div>
                    <div className="claude-code-tool detail-row">
                        <span className="claude-code-tool detail-label">To</span>
                        <pre className="claude-code-tool detail-value code-preview">
                            {edit.new_string.length > 100
                                ? edit.new_string.substring(0, 100) + '...'
                                : edit.new_string}
                        </pre>
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <CollapsibleToolRenderer
            compactHeader={compactHeader}
            expandedContent={expandedContent}
        />
    );
};
