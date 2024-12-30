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
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceFunctionScope } from './functions';

interface ChangeOperation {
    operation: 'replace' | 'insert_after' | 'insert_before' | 'delete' | 'replace_entire_file' | 'insert_at' | 'create_file' | 'delete_file';
    find?: string; // Optional for operations like 'replace', 'insert_after', 'insert_before', 'delete'.
    replaceWith?: string; // Required for 'replace'.
    insertAfter?: string; // Required for 'insert_after'.
    insertBefore?: string; // Required for 'insert_before'.
    newContent?: string; // Required for 'replace_entire_file' or 'insert_at'/'create_file'.
    position?: 'start_of_file' | 'end_of_file'; // Required for 'insert_at'.
}

interface FileChange {
    file: string; // The relative or absolute path to the file.
    changes: ChangeOperation[]; // A list of operations to be applied to this file.
}

interface ChangeSet {
    uuid: string; // A unique identifier for the change set.
    description: string; // A description of the purpose of the change set.
    fileChanges: Map<string, FileChange>; // A map of file paths to file changes.
}

@injectable()
export class ChangeSetService {
    @inject(FileService)
    fileService: FileService;

    @inject(WorkspaceFunctionScope)
    workspaceScope: WorkspaceFunctionScope;

    private changeSets: Map<string, ChangeSet> = new Map();

    initializeChangeSet(uuid: string, description: string): void {
        this.changeSets.set(uuid, { uuid, description, fileChanges: new Map() });
    }

    addFileChange(uuid: string, filePath: string, changes: ChangeOperation[]): void {
        const changeSet = this.changeSets.get(uuid);
        if (!changeSet) {
            throw new Error(`Change set ${uuid} does not exist.`);
        }
        changeSet.fileChanges.set(filePath, { file: filePath, changes });
    }

    updateFileChange(uuid: string, filePath: string, changes: ChangeOperation[]): void {
        const changeSet = this.changeSets.get(uuid);
        if (!changeSet) {
            throw new Error(`Change set ${uuid} does not exist.`);
        }
        const fileChange = changeSet.fileChanges.get(filePath);
        if (!fileChange) {
            throw new Error(`File ${filePath} not found in change set ${uuid}.`);
        }
        fileChange.changes = changes;
    }

    removeFileChange(uuid: string, filePath: string): void {
        const changeSet = this.changeSets.get(uuid);
        if (!changeSet) {
            throw new Error(`Change set ${uuid} does not exist.`);
        }
        changeSet.fileChanges.delete(filePath);
    }

    getChangeSet(uuid: string): ChangeSet {
        const changeSet = this.changeSets.get(uuid);
        if (!changeSet) {
            throw new Error(`Change set ${uuid} does not exist.`);
        }
        return changeSet;
    }

    listChangedFiles(uuid: string): string[] {
        const changeSet = this.changeSets.get(uuid);
        if (!changeSet) {
            throw new Error(`Change set ${uuid} does not exist.`);
        }
        return Array.from(changeSet.fileChanges.keys());
    }

    getFileChanges(uuid: string, filePath: string): ChangeOperation[] {
        const changeSet = this.changeSets.get(uuid);
        if (!changeSet) {
            throw new Error(`Change set ${uuid} does not exist.`);
        }
        const fileChange = changeSet.fileChanges.get(filePath);
        if (!fileChange) {
            throw new Error(`File ${filePath} not found in change set ${uuid}.`);
        }
        return fileChange.changes;
    }

    async applyChangeSet(uuid: string): Promise<void> {
        const changeSet = this.changeSets.get(uuid);
        if (!changeSet) {
            throw new Error(`Change set ${uuid} does not exist.`);
        }

        const workspaceRoot = await this.workspaceScope.getWorkspaceRoot();

        for (const fileChange of changeSet.fileChanges.values()) {
            const file = fileChange.file;
            const fileUri = workspaceRoot.resolve(file);
            this.workspaceScope.ensureWithinWorkspace(fileUri, workspaceRoot);
            let fileContent;

            try {
                fileContent = await this.fileService.read(fileUri);
            } catch (error) {
                throw new Error(`Failed to read file: ${fileChange.file}`);
            }

            let updatedContent = fileContent.value;

            for (const operation of fileChange.changes) {
                switch (operation.operation) {
                    case 'replace':
                        if (operation.find) {
                            updatedContent = updatedContent.replace(operation.find, operation.replaceWith || '');
                        }
                        break;
                    case 'insert_after':
                        if (operation.insertAfter) {
                            updatedContent = updatedContent.replace(operation.insertAfter, operation.insertAfter + (operation.replaceWith || ''));
                        }
                        break;
                    case 'insert_before':
                        if (operation.insertBefore) {
                            updatedContent = updatedContent.replace(operation.insertBefore, (operation.replaceWith || '') + operation.insertBefore);
                        }
                        break;
                    case 'delete':
                        if (operation.find) {
                            updatedContent = updatedContent.replace(operation.find, '');
                        }
                        break;
                    case 'replace_entire_file':
                        updatedContent = operation.newContent || '';
                        break;
                    case 'insert_at':
                        if (operation.position === 'start_of_file') {
                            updatedContent = (operation.newContent || '') + updatedContent;
                        } else if (operation.position === 'end_of_file') {
                            updatedContent = updatedContent + (operation.newContent || '');
                        }
                        break;
                    case 'create_file':
                        updatedContent = operation.newContent || '';
                        break;
                    case 'delete_file':
                        await this.fileService.delete(fileUri);
                        continue; // Skip writing the deleted file
                }
            }

            try {
                await this.fileService.write(fileUri, updatedContent);
            } catch (error) {
                throw new Error(`Failed to write file: ${fileChange.file}`);
            }
        }
    }
}

@injectable()
export class InitializeChangeSetProvider implements ToolProvider {
    static ID = 'changeSet_initializeChangeSet';

    @inject(ChangeSetService)
    protected readonly changeSetService: ChangeSetService;

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
                const { uuid, description } = JSON.parse(args);
                this.changeSetService.initializeChangeSet(uuid, description);
                return `Change set ${uuid} initialized successfully.`;
            }
        };
    }
}

@injectable()
export class AddFileChangeProvider implements ToolProvider {
    static ID = 'changeSet_addFileChange';

    @inject(ChangeSetService)
    protected readonly changeSetService: ChangeSetService;

    getTool(): ToolRequest {
        return {
            id: AddFileChangeProvider.ID,
            name: AddFileChangeProvider.ID,
            description: 'Adds a file change to a change set.',
            parameters: {
                type: 'object',
                properties: {
                    uuid: { type: 'string', description: 'Unique identifier for the change set.' },
                    filePath: { type: 'string', description: 'Path to the file.' },
                    changes: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                operation: { type: 'string', description: 'Type of operation (e.g., replace, delete, etc.).' },
                                find: { type: 'string', nullable: true },
                                replaceWith: { type: 'string', nullable: true },
                                insertAfter: { type: 'string', nullable: true },
                                insertBefore: { type: 'string', nullable: true },
                                newContent: { type: 'string', nullable: true },
                                position: { type: 'string', enum: ['start_of_file', 'end_of_file'], nullable: true }
                            },
                            required: ['operation']
                        }
                    }
                },
                required: ['uuid', 'filePath', 'changes']
            },
            handler: async (args: string): Promise<string> => {
                const { uuid, filePath, changes } = JSON.parse(args);
                this.changeSetService.addFileChange(uuid, filePath, changes);
                return `File ${filePath} added to change set ${uuid}.`;
            }
        };
    }
}

@injectable()
export class UpdateFileChangeProvider implements ToolProvider {
    static ID = 'changeSet_updateFileChange';

    @inject(ChangeSetService)
    protected readonly changeSetService: ChangeSetService;

    getTool(): ToolRequest {
        return {
            id: UpdateFileChangeProvider.ID,
            name: UpdateFileChangeProvider.ID,
            description: 'Updates the operations of a file in the specified change set.',
            parameters: {
                type: 'object',
                properties: {
                    uuid: { type: 'string', description: 'Unique identifier for the change set.' },
                    filePath: { type: 'string', description: 'Path to the file.' },
                    changes: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                operation: { type: 'string', description: 'Type of operation (e.g., replace, delete, etc.).' },
                                find: { type: 'string', nullable: true },
                                replaceWith: { type: 'string', nullable: true },
                                insertAfter: { type: 'string', nullable: true },
                                insertBefore: { type: 'string', nullable: true },
                                newContent: { type: 'string', nullable: true },
                                position: { type: 'string', enum: ['start_of_file', 'end_of_file'], nullable: true }
                            },
                            required: ['operation']
                        }
                    }
                },
                required: ['uuid', 'filePath', 'changes']
            },
            handler: async (args: string): Promise<string> => {
                const { uuid, filePath, changes } = JSON.parse(args);
                this.changeSetService.updateFileChange(uuid, filePath, changes);
                return `File ${filePath} updated in change set ${uuid}.`;
            }
        };
    }
}

@injectable()
export class RemoveFileChangeProvider implements ToolProvider {
    static ID = 'changeSet_removeFileChange';

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
                    uuid: { type: 'string', description: 'Unique identifier for the change set.' },
                    filePath: { type: 'string', description: 'Path to the file.' }
                },
                required: ['uuid', 'filePath']
            },
            handler: async (args: string): Promise<string> => {
                const { uuid, filePath } = JSON.parse(args);
                this.changeSetService.removeFileChange(uuid, filePath);
                return `File ${filePath} removed from change set ${uuid}.`;
            }
        };
    }
}

@injectable()
export class ListChangedFilesProvider implements ToolProvider {
    static ID = 'changeSet_listChangedFiles';

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
                    uuid: { type: 'string', description: 'Unique identifier for the change set.' }
                },
                required: ['uuid']
            },
            handler: async (args: string): Promise<string> => {
                const { uuid } = JSON.parse(args);
                const files = this.changeSetService.listChangedFiles(uuid);
                return JSON.stringify(files); // Ensure the return is stringified
            }
        };
    }
}

@injectable()
export class GetFileChangesProvider implements ToolProvider {
    static ID = 'changeSet_getFileChanges';

    @inject(ChangeSetService)
    protected readonly changeSetService: ChangeSetService;

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
                const { uuid, filePath } = JSON.parse(args);
                const changes = this.changeSetService.getFileChanges(uuid, filePath);
                return JSON.stringify(changes); // Ensure the return is stringified
            }
        };
    }
}

@injectable()
export class GetChangeSetProvider implements ToolProvider {
    static ID = 'changeSet_getChangeSet';

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
                    uuid: { type: 'string', description: 'Unique identifier for the change set.' }
                },
                required: ['uuid']
            },
            handler: async (args: string): Promise<string> => {
                const { uuid } = JSON.parse(args);
                const changeSet = this.changeSetService.getChangeSet(uuid);
                return JSON.stringify(changeSet); // Ensure the return is stringified
            }
        };
    }
}

@injectable()
export class ApplyChangeSetProvider implements ToolProvider {
    static ID = 'changeSet_applyChangeSet';

    @inject(ChangeSetService)
    protected readonly changeSetService: ChangeSetService;

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
                const { uuid } = JSON.parse(args);
                await this.changeSetService.applyChangeSet(uuid);
                return `Change set ${uuid} applied successfully.`;
            }
        };
    }
}

