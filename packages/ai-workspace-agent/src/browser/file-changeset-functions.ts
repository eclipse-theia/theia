// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { injectable, inject } from '@theia/core/shared/inversify';
import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { WorkspaceFunctionScope } from './workspace-functions';
import { ChangeSetFileElementFactory } from '@theia/ai-chat/lib/browser/change-set-file-element';
import { ChangeSetImpl, ChatRequestModelImpl } from '@theia/ai-chat';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

@injectable()
export class WriteChangeToFileProvider implements ToolProvider {
    static ID = 'changeSet_writeChangeToFile';

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceFunctionScope: WorkspaceFunctionScope;

    @inject(FileService)
    fileService: FileService;

    @inject(ChangeSetFileElementFactory)
    protected readonly fileChangeFactory: ChangeSetFileElementFactory;

    getTool(): ToolRequest {
        return {
            id: WriteChangeToFileProvider.ID,
            name: WriteChangeToFileProvider.ID,
            description: `Proposes writing content to a file. If the file exists, it will be overwritten with the provided content.\n
             If the file does not exist, it will be created. This tool will automatically create any directories needed to write the file.\n
             If the new content is empty, the file will be deleted. To move a file, delete it and re-create it at the new location.\n
             The proposed changes will be applied when the user accepts.`,
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The path of the file to write to.'
                    },
                    content: {
                        type: 'string',
                        description: `The content to write to the file. ALWAYS provide the COMPLETE intended content of the file, without any truncation or omissions.\n
                         You MUST include ALL parts of the file, even if they haven\'t been modified.`
                    }
                },
                required: ['path', 'content']
            },
            handler: async (args: string, ctx: ChatRequestModelImpl): Promise<string> => {
                const { path, content } = JSON.parse(args);
                const chatSessionId = ctx.session.id;
                let changeSet = ctx.session.changeSet;
                if (!changeSet) {
                    changeSet = new ChangeSetImpl('Changes proposed by Coder');
                    ctx.session.setChangeSet(changeSet);
                }
                const uri = await this.workspaceFunctionScope.resolveRelativePath(path);
                let type = 'modify';
                if (content === '') {
                    type = 'delete';
                }
                // In case the file does not exist and the content is empty, we consider that the AI wants to add an empty file.
                try {
                    await this.fileService.read(uri);
                } catch (error) {
                    type = 'add';
                }
                changeSet.addElement(
                    this.fileChangeFactory({
                        uri: uri,
                        type: type as 'modify' | 'add' | 'delete',
                        state: 'pending',
                        targetState: content,
                        changeSet,
                        chatSessionId
                    })
                );
                return `Proposed writing to file ${path}. The user will review and potentially apply the changes`;
            }
        };
    }
}
