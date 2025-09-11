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

interface ReadToolInput {
    file_path: string;
    limit?: number;
    offset?: number;
}

@injectable()
export class ReadToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    canHandle(response: ChatResponseContent): number {
        if (ClaudeCodeToolCallChatResponseContent.is(response) && response.name === 'Read') {
            return 15; // Higher than default ToolCallPartRenderer (10)
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        try {
            const input = JSON.parse(response.arguments || '{}') as ReadToolInput;
            return <ReadToolComponent
                input={input}
                workspaceService={this.workspaceService}
                labelProvider={this.labelProvider}
                editorManager={this.editorManager}
            />;
        } catch (error) {
            console.warn('Failed to parse Read tool input:', error);
            return <div className="claude-code-tool error">Failed to parse Read tool data</div>;
        }
    }
}

const ReadToolComponent: React.FC<{
    input: ReadToolInput;
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

    const isEntireFile = !input.limit && !input.offset;

    return (
        <div className="claude-code-tool container">
            <div className="claude-code-tool header" onClick={handleOpenFile} style={{ cursor: 'pointer' }}>
                <div className="claude-code-tool header-left">
                    <span className="claude-code-tool title">Reading</span>
                    <span className={`${getIcon(input.file_path)} claude-code-tool icon`} />
                    <span className="claude-code-tool file-name">{getFileName(input.file_path)}</span>
                    {relativePath && <span className="claude-code-tool relative-path">{relativePath}</span>}
                </div>
                {isEntireFile && (
                    <div className="claude-code-tool header-right">
                        <span className="claude-code-tool badge">Entire File</span>
                    </div>
                )}
            </div>
        </div>
    );
};
