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
import { FileChangeSetService } from './file-changeset-service';
import { ReplaceChangeOperation } from './replace-content-change-applier';

@injectable()
export class WriteChangeToFileProvider implements ToolProvider {
    static ID = 'changeSet_writeChangeToFile';

    @inject(FileChangeSetService)
    protected readonly changeSetService: FileChangeSetService;

    getTool(): ToolRequest {
        return {
            id: WriteChangeToFileProvider.ID,
            name: WriteChangeToFileProvider.ID,
            description: `Proposes writing content to a file in the specified change set. If the file exists, it will be overwritten with the provided content.\n
             If the file does not exist, it will be created. This tool will automatically create any directories needed to write the file.\n
             The changes can be applied when the user accepts.`,
            parameters: {
                type: 'object',
                properties: {
                    uuid: {
                        type: 'string',
                        description: 'Unique identifier for the change set.'
                    },
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
                required: ['uuid', 'path', 'content']
            },
            handler: async (args: string): Promise<string> => {
                try {
                    const { uuid, path, content } = JSON.parse(args);
                    const operation: ReplaceChangeOperation = {
                        kind: 'replace',
                        newContent: content
                    };
                    this.changeSetService.addFileChange(uuid, path, [operation]);
                    return `Proposed writing to file ${path} in change set ${uuid}. Please review and apply the changes as needed.`;
                } catch (error) {
                    return JSON.stringify({ error: error.message });
                }
            }
        };
    }
}
