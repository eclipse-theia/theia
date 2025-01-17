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
import { injectable, inject } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceFunctionScope } from './workspace-functions';
import { ContentChangeApplierService, ChangeOperation } from './content-change-applier-service';

/**
 * Represents the changes that should be applied to a specific file.
 */
interface FileChange {
    /**
     * The relative path of the file within the workspace.
     */
    file: string;

    /**
     * A list of operations to apply to the file content.
     */
    changes: ChangeOperation[];
}

/**
 * Represents a set of file changes.
 */
interface ChangeSet {
    /**
     * A unique identifier for the change set.
     */
    uuid: string;

    /**
     * A human-readable description explaining the purpose of this change set.
     */
    description: string;

    /**
     * A map where each key is the file path and the value is the corresponding {@link FileChange}s.
     */
    fileChanges: Map<string, FileChange>;
}

/**
 * Service responsible for managing and applying sets of content changes across files.
 *
 * This service allows initialization, modification, and application of file {@link ChangeSet}s.
 */
@injectable()
export class FileChangeSetService {
    @inject(FileService)
    fileService: FileService;

    @inject(WorkspaceFunctionScope)
    workspaceScope: WorkspaceFunctionScope;

    @inject(ContentChangeApplierService)
    private contentChangeApplier: ContentChangeApplierService;

    private changeSets: Map<string, ChangeSet> = new Map();

    /**
     * Initializes a new change set with the provided UUID and description.
     *
     * @param uuid - The unique identifier for the change set.
     * @param description - A description of the purpose of the change set.
     */
    initializeChangeSet(uuid: string, description: string): void {
        this.changeSets.set(uuid, { uuid, description, fileChanges: new Map() });
    }

    /**
     * Checks whether a change set with the specified UUID is initialized.
     * @param uuid - The UUID of the change set to check.
     * @returns `true` if the change set exists and is initialized; otherwise, `false`.
     */
    isChangeSetInitialized(uuid: string): boolean {
        return this.changeSets.has(uuid);
    }

    /**
     * Adds a file change to an existing change set.
     *
     * @param uuid - The UUID of the change set.
     * @param filePath - The relative file path for which the change is defined.
     * @param changes - An array of {@link ChangeOperation}s to apply to the file.
     * @throws Will throw an error if the specified change set does not exist.
     */
    addFileChange(uuid: string, filePath: string, changes: ChangeOperation[]): void {
        const changeSet = this.changeSets.get(uuid);
        if (!changeSet) {
            throw new Error(`Change set ${uuid} does not exist.`);
        }
        changeSet.fileChanges.set(filePath, { file: filePath, changes });
    }

    /**
     * Removes a file change from a change set.
     *
     * @param uuid - The UUID of the change set.
     * @param filePath - The file path of the change to remove.
     * @throws Will throw an error if the specified change set does not exist.
     */
    removeFileChange(uuid: string, filePath: string): void {
        const changeSet = this.changeSets.get(uuid);
        if (!changeSet) {
            throw new Error(`Change set ${uuid} does not exist.`);
        }
        changeSet.fileChanges.delete(filePath);
    }

    /**
     * Retrieves the change set for a given UUID.
     *
     * @param uuid - The unique identifier for the change set.
     * @returns The corresponding ChangeSet object.
     * @throws Will throw an error if the change set does not exist.
     */
    getChangeSet(uuid: string): ChangeSet {
        const changeSet = this.changeSets.get(uuid);
        if (!changeSet) {
            throw new Error(`Change set ${uuid} does not exist.`);
        }
        return changeSet;
    }

    /**
     * Lists all file paths that have changes in a given change set.
     *
     * @param uuid - The UUID of the change set.
     * @returns An array of file paths that have recorded changes.
     * @throws Will throw an error if the change set does not exist.
     */
    listChangedFiles(uuid: string): string[] {
        const changeSet = this.changeSets.get(uuid);
        if (!changeSet) {
            throw new Error(`Change set ${uuid} does not exist.`);
        }
        return Array.from(changeSet.fileChanges.keys());
    }

    /**
     * Retrieves the list of change operations for a specific file in a change set.
     *
     * @param uuid - The UUID of the change set.
     * @param filePath - The relative path of the file within the change set.
     * @returns An array of ChangeOperation objects for the specified file.
     * @throws Will throw an error if the change set or file change does not exist.
     */
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

    /**
     * Applies a set of changes to a single file.
     *
     * If a file does not exist, it will be created.
     *
     * @param fileChange - The file change object containing the relative file path and change operations.
     * @throws Will throw an error if writing the file fails.
     */
    async applyFileChange(fileChange: FileChange): Promise<void> {

        const workspaceRoot = await this.workspaceScope.getWorkspaceRoot();
        const fileUri = workspaceRoot.resolve(fileChange.file);
        this.workspaceScope.ensureWithinWorkspace(fileUri, workspaceRoot);

        let fileContent: { value: string } | undefined;
        try {
            fileContent = await this.fileService.read(fileUri);
        } catch (error) {
            // Ignore the read error, we create a new file in this case. We might make this explicit for operations in the future.
        }

        const initialContent = fileContent?.value || '';
        const updatedContent = this.contentChangeApplier.applyChangesToContent(initialContent, fileChange.changes);

        try {
            await this.fileService.write(fileUri, updatedContent);
        } catch (error) {
            throw new Error(`Failed to write file: ${fileChange.file}`);
        }
    }

    /**
     * Applies all file changes contained in a change set.
     *
     * Iterates through each file in the change set and attempts to apply the associated changes.
     * Collects any errors that occur during processing and, if any errors are present after processing,
     * throws a single aggregated Error with details.
     *
     * @param uuid - The UUID of the change set to apply.
     * @throws Will throw an error if the change set does not exist. Will throw an aggregated error if one or more file changes fail to apply.
     */
    async applyChangeSet(uuid: string): Promise<void> {
        const changeSet = this.changeSets.get(uuid);
        if (!changeSet) {
            throw new Error(`Change set ${uuid} does not exist.`);
        }
        const errorMessages: string[] = [];

        for (const filePath of changeSet.fileChanges.keys()) {
            const fileChange = changeSet.fileChanges.get(filePath);
            if (!fileChange) {
                errorMessages.push(`File "${filePath}" not found in change set "${uuid}".`);
                continue;
            }
            try {
                await this.applyFileChange(fileChange);
            } catch (error) {
                if (error instanceof Error) {
                    errorMessages.push(`Error applying change to "${filePath}": ${error.message}`);
                } else {
                    // Handle non-Error exceptions
                    errorMessages.push(`Unknown error applying change to "${filePath}": ${error}`);
                }
            }
        }
        if (errorMessages.length > 0) {
            const combinedErrorMessage = `Failed to apply some file changes for change set "${uuid}":\n` +
                errorMessages.map((msg, index) => `${index + 1}. ${msg}`).join('\n');
            throw new Error(combinedErrorMessage);
        }
    }
}
