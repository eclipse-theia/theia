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

@injectable()
export class InitializeChangeSetProvider implements ToolProvider {
    static ID = 'changeSet_initializeChangeSet';

    @inject(FileChangeSetService)
    protected readonly changeSetService: FileChangeSetService;

    getTool(): ToolRequest {
        return {
            id: InitializeChangeSetProvider.ID,
            name: InitializeChangeSetProvider.ID,
            description: 'Creates a new change set with a unique UUID and description.',
            parameters: {
                type: 'object',
                properties: {
                    uuid: { type: 'string', description: 'Unique identifier for the change set.' },
                    description: { type: 'string', description: 'High-level description of the change set.' }
                },
                required: ['uuid', 'description']
            },
            handler: async (args: string): Promise<string> => {
                try {
                    const { uuid, description } = JSON.parse(args);
                    this.changeSetService.initializeChangeSet(uuid, description);
                    return `Change set ${uuid} initialized successfully.`;
                } catch (error) {
                    return JSON.stringify({ error: error.message });
                }
            }
        };
    }
}

@injectable()
export class RemoveFileChangeProvider implements ToolProvider {
    static ID = 'changeSet_removeFileChange';

    @inject(FileChangeSetService)
    protected readonly changeSetService: FileChangeSetService;

    getTool(): ToolRequest {
        return {
            id: RemoveFileChangeProvider.ID,
            name: RemoveFileChangeProvider.ID,
            description: 'Removes a file and all related changes from the specified change set.',
            parameters: {
                type: 'object',
                properties: {
                    uuid: { type: 'string', description: 'Unique identifier for the change set.' },
                    filePath: { type: 'string', description: 'Path to the file.' }
                },
                required: ['uuid', 'filePath']
            },
            handler: async (args: string): Promise<string> => {
                try {
                    const { uuid, filePath } = JSON.parse(args);
                    this.changeSetService.removeFileChange(uuid, filePath);
                    return `File ${filePath} removed from change set ${uuid}.`;
                } catch (error) {
                    return JSON.stringify({ error: error.message });
                }
            }
        };
    }
}

@injectable()
export class ListChangedFilesProvider implements ToolProvider {
    static ID = 'changeSet_listChangedFiles';

    @inject(FileChangeSetService)
    protected readonly changeSetService: FileChangeSetService;

    getTool(): ToolRequest {
        return {
            id: ListChangedFilesProvider.ID,
            name: ListChangedFilesProvider.ID,
            description: 'Lists all files included in a specific change set.',
            parameters: {
                type: 'object',
                properties: {
                    uuid: { type: 'string', description: 'Unique identifier for the change set.' }
                },
                required: ['uuid']
            },
            handler: async (args: string): Promise<string> => {
                try {
                    const { uuid } = JSON.parse(args);
                    const files = this.changeSetService.listChangedFiles(uuid);
                    return JSON.stringify(files);
                } catch (error) {
                    return JSON.stringify({ error: error.message });
                }
            }
        };
    }
}

@injectable()
export class GetFileChangesProvider implements ToolProvider {
    static ID = 'changeSet_getFileChanges';

    @inject(FileChangeSetService)
    protected readonly changeSetService: FileChangeSetService;

    getTool(): ToolRequest {
        return {
            id: GetFileChangesProvider.ID,
            name: GetFileChangesProvider.ID,
            description: 'Fetches the operations of a specific file in a change set.',
            parameters: {
                type: 'object',
                properties: {
                    uuid: { type: 'string', description: 'Unique identifier for the change set.' },
                    filePath: { type: 'string', description: 'Path to the file.' }
                },
                required: ['uuid', 'filePath']
            },
            handler: async (args: string): Promise<string> => {
                try {
                    const { uuid, filePath } = JSON.parse(args);
                    const changes = this.changeSetService.getFileChanges(uuid, filePath);
                    return JSON.stringify(changes);
                } catch (error) {
                    return JSON.stringify({ error: error.message });
                }
            }
        };
    }
}

@injectable()
export class GetChangeSetProvider implements ToolProvider {
    static ID = 'changeSet_getChangeSet';

    @inject(FileChangeSetService)
    protected readonly changeSetService: FileChangeSetService;

    getTool(): ToolRequest {
        return {
            id: GetChangeSetProvider.ID,
            name: GetChangeSetProvider.ID,
            description: 'Fetches the details of a specific change set.',
            parameters: {
                type: 'object',
                properties: {
                    uuid: { type: 'string', description: 'Unique identifier for the change set.' }
                },
                required: ['uuid']
            },
            handler: async (args: string): Promise<string> => {
                try {
                    const { uuid } = JSON.parse(args);
                    const changeSet = this.changeSetService.getChangeSet(uuid);
                    return JSON.stringify(changeSet);
                } catch (error) {
                    return JSON.stringify({ error: error.message });
                }
            }
        };
    }
}

@injectable()
export class ApplyChangeSetProvider implements ToolProvider {
    static ID = 'changeSet_applyChangeSet';

    @inject(FileChangeSetService)
    protected readonly changeSetService: FileChangeSetService;

    getTool(): ToolRequest {
        return {
            id: ApplyChangeSetProvider.ID,
            name: ApplyChangeSetProvider.ID,
            description: 'Applies the specified change set by UUID, executing all file modifications described within.',
            parameters: {
                type: 'object',
                properties: {
                    uuid: { type: 'string', description: 'Unique identifier for the change set to apply.' }
                },
                required: ['uuid']
            },
            handler: async (args: string): Promise<string> => {
                try {
                    const { uuid } = JSON.parse(args);
                    await this.changeSetService.applyChangeSet(uuid);
                    return `Change set ${uuid} applied successfully.`;
                } catch (error) {
                    return JSON.stringify({ error: error.message });
                }
            }
        };
    }
}
