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

interface FileChange {
    diff: string;
    changeType: string;
    comments: string[];
}

interface ChangeSet {
    description: string;
    changes: Map<string, FileChange>;
}

@injectable()
export class ChangeSetService {
    private changeSets: Map<string, ChangeSet> = new Map();

    initializeChangeSet(name: string, description: string): void {
        this.changeSets.set(name, { description, changes: new Map() });
    }

    addFileChange(changeSetName: string, filePath: string, diff: string, changeType: string, comments: string[]): void {
        const changeSet = this.changeSets.get(changeSetName);
        if (!changeSet) {
            throw new Error(`Change set ${changeSetName} does not exist.`);
        }
        changeSet.changes.set(filePath, { diff, changeType, comments });
    }

    updateFileChange(changeSetName: string, filePath: string, diff?: string, comments?: string[]): void {
        const changeSet = this.changeSets.get(changeSetName);
        if (!changeSet) {
            throw new Error(`Change set ${changeSetName} does not exist.`);
        }
        const change = changeSet.changes.get(filePath);
        if (!change) {
            throw new Error(`File ${filePath} not found in change set ${changeSetName}.`);
        }
        if (diff !== undefined) {
            change.diff = diff;
        }
        if (comments !== undefined) {
            change.comments = comments;
        }
    }

    removeFileChange(changeSetName: string, filePath: string): void {
        const changeSet = this.changeSets.get(changeSetName);
        if (!changeSet) {
            throw new Error(`Change set ${changeSetName} does not exist.`);
        }
        changeSet.changes.delete(filePath);
    }

    getChangeSet(changeSetName: string): ChangeSet {
        const changeSet = this.changeSets.get(changeSetName);
        if (!changeSet) {
            throw new Error(`Change set ${changeSetName} does not exist.`);
        }
        return changeSet;
    }

    listChangedFiles(changeSetName: string): string[] {
        const changeSet = this.changeSets.get(changeSetName);
        if (!changeSet) {
            throw new Error(`Change set ${changeSetName} does not exist.`);
        }
        return Array.from(changeSet.changes.keys());
    }

    getFileDiff(changeSetName: string, filePath: string): string {
        const changeSet = this.changeSets.get(changeSetName);
        if (!changeSet) {
            throw new Error(`Change set ${changeSetName} does not exist.`);
        }
        const change = changeSet.changes.get(filePath);
        if (!change) {
            throw new Error(`File ${filePath} not found in change set ${changeSetName}.`);
        }
        return change.diff;
    }
}

export const INITIALIZE_CHANGE_SET_FUNCTION_ID = 'changeSet_initializeChangeSet';
export const ADD_FILE_CHANGE_FUNCTION_ID = 'changeSet_addFileChange';
export const UPDATE_FILE_CHANGE_FUNCTION_ID = 'changeSet_updateFileChange';
export const REMOVE_FILE_CHANGE_FUNCTION_ID = 'changeSet_removeFileChange';
export const GET_CHANGE_SET_FUNCTION_ID = 'changeSet_getChangeSet';
export const LIST_CHANGED_FILES_FUNCTION_ID = 'changeSet_listChangedFiles';
export const GET_FILE_DIFF_FUNCTION_ID = 'changeSet_getFileDiff';

@injectable()
export class InitializeChangeSetProvider implements ToolProvider {
    static ID = INITIALIZE_CHANGE_SET_FUNCTION_ID;

    @inject(ChangeSetService)
    protected readonly changeSetService: ChangeSetService;

    getTool(): ToolRequest {
        return {
            id: InitializeChangeSetProvider.ID,
            name: InitializeChangeSetProvider.ID,
            description: 'Creates a new change set with a name and description.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Name of the change set.' },
                    description: { type: 'string', description: 'High-level description of the change set.' }
                },
                required: ['name', 'description']
            },
            handler: async (args: string): Promise<string> => {
                const { name, description } = JSON.parse(args);
                this.changeSetService.initializeChangeSet(name, description);
                return `Change set ${name} initialized successfully.`;
            }
        };
    }
}

@injectable()
export class AddFileChangeProvider implements ToolProvider {
    static ID = ADD_FILE_CHANGE_FUNCTION_ID;

    @inject(ChangeSetService)
    protected readonly changeSetService: ChangeSetService;

    getTool(): ToolRequest {
        return {
            id: AddFileChangeProvider.ID,
            name: AddFileChangeProvider.ID,
            description: 'Adds or modifies a file\'s diff in the specified change set.',
            parameters: {
                type: 'object',
                properties: {
                    changeSetName: { type: 'string', description: 'Name of the change set.' },
                    filePath: { type: 'string', description: 'Path to the file.' },
                    diff: { type: 'string', description: 'Unified diff of the file.' },
                    changeType: { type: 'string', enum: ['add', 'modify', 'delete'], description: 'Type of change.' },
                    comments: { type: 'array', items: { type: 'string' }, description: 'Optional comments.' }
                },
                required: ['changeSetName', 'filePath', 'diff', 'changeType']
            },
            handler: async (args: string): Promise<string> => {
                const { changeSetName, filePath, diff, changeType, comments = [] } = JSON.parse(args);
                this.changeSetService.addFileChange(changeSetName, filePath, diff, changeType, comments);
                return `File ${filePath} changes added to change set ${changeSetName}.`;
            }
        };
    }
}

@injectable()
export class UpdateFileChangeProvider implements ToolProvider {
    static ID = UPDATE_FILE_CHANGE_FUNCTION_ID;

    @inject(ChangeSetService)
    protected readonly changeSetService: ChangeSetService;

    getTool(): ToolRequest {
        return {
            id: UpdateFileChangeProvider.ID,
            name: UpdateFileChangeProvider.ID,
            description: 'Updates the diff or comments of a file in a change set.',
            parameters: {
                type: 'object',
                properties: {
                    changeSetName: { type: 'string', description: 'Name of the change set.' },
                    filePath: { type: 'string', description: 'Path to the file.' },
                    diff: { type: 'string', description: 'New unified diff of the file.', nullable: true },
                    comments: { type: 'array', items: { type: 'string' }, description: 'Updated comments.', nullable: true }
                },
                required: ['changeSetName', 'filePath']
            },
            handler: async (args: string): Promise<string> => {
                const { changeSetName, filePath, diff, comments } = JSON.parse(args);
                this.changeSetService.updateFileChange(changeSetName, filePath, diff, comments);
                return `File ${filePath} updated in change set ${changeSetName}.`;
            }
        };
    }
}

@injectable()
export class RemoveFileChangeProvider implements ToolProvider {
    static ID = REMOVE_FILE_CHANGE_FUNCTION_ID;

    @inject(ChangeSetService)
    protected readonly changeSetService: ChangeSetService;

    getTool(): ToolRequest {
        return {
            id: RemoveFileChangeProvider.ID,
            name: RemoveFileChangeProvider.ID,
            description: 'Removes a file from the specified change set.',
            parameters: {
                type: 'object',
                properties: {
                    changeSetName: { type: 'string', description: 'Name of the change set.' },
                    filePath: { type: 'string', description: 'Path to the file.' }
                },
                required: ['changeSetName', 'filePath']
            },
            handler: async (args: string): Promise<string> => {
                const { changeSetName, filePath } = JSON.parse(args);
                this.changeSetService.removeFileChange(changeSetName, filePath);
                return `File ${filePath} removed from change set ${changeSetName}.`;
            }
        };
    }
}

@injectable()
export class GetChangeSetProvider implements ToolProvider {
    static ID = GET_CHANGE_SET_FUNCTION_ID;

    @inject(ChangeSetService)
    protected readonly changeSetService: ChangeSetService;

    getTool(): ToolRequest {
        return {
            id: GetChangeSetProvider.ID,
            name: GetChangeSetProvider.ID,
            description: 'Fetches the details of a specific change set.',
            parameters: {
                type: 'object',
                properties: {
                    changeSetName: { type: 'string', description: 'Name of the change set.' }
                },
                required: ['changeSetName']
            },
            handler: async (args: string): Promise<string> => {
                const { changeSetName } = JSON.parse(args);
                const changeSet = this.changeSetService.getChangeSet(changeSetName);
                return JSON.stringify(changeSet); // Ensure return type is a string
            }
        };
    }
}

@injectable()
export class ListChangedFilesProvider implements ToolProvider {
    static ID = LIST_CHANGED_FILES_FUNCTION_ID;

    @inject(ChangeSetService)
    protected readonly changeSetService: ChangeSetService;

    getTool(): ToolRequest {
        return {
            id: ListChangedFilesProvider.ID,
            name: ListChangedFilesProvider.ID,
            description: 'Lists all files included in a specific change set.',
            parameters: {
                type: 'object',
                properties: {
                    changeSetName: { type: 'string', description: 'Name of the change set.' }
                },
                required: ['changeSetName']
            },
            handler: async (args: string): Promise<string> => {
                const { changeSetName } = JSON.parse(args);
                const files = this.changeSetService.listChangedFiles(changeSetName);
                return JSON.stringify(files); // Ensure return type is a string
            }
        };
    }
}

@injectable()
export class GetFileDiffProvider implements ToolProvider {
    static ID = GET_FILE_DIFF_FUNCTION_ID;

    @inject(ChangeSetService)
    protected readonly changeSetService: ChangeSetService;

    getTool(): ToolRequest {
        return {
            id: GetFileDiffProvider.ID,
            name: GetFileDiffProvider.ID,
            description: 'Fetches the diff of a specific file in a change set.',
            parameters: {
                type: 'object',
                properties: {
                    changeSetName: { type: 'string', description: 'Name of the change set.' },
                    filePath: { type: 'string', description: 'Path to the file.' }
                },
                required: ['changeSetName', 'filePath']
            },
            handler: async (args: string): Promise<string> => {
                const { changeSetName, filePath } = JSON.parse(args);
                return this.changeSetService.getFileDiff(changeSetName, filePath);
            }
        };
    }
}
