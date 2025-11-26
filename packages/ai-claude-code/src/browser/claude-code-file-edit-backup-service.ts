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

import { MutableChatRequestModel } from '@theia/ai-chat';
import { ChangeSetFileElement } from '@theia/ai-chat/lib/browser/change-set-file-element';
import { URI } from '@theia/core/lib/common/uri';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { CLAUDE_SESSION_ID_KEY } from './claude-code-chat-agent';
import { ILogger } from '@theia/core';

export const FileEditBackupService = Symbol('FileEditBackupService');

/**
 * Service for managing file backup operations during Claude Code edit sessions.
 *
 * This service handles the retrieval of original file content from backup files
 * created by the file backup hooks in ClaudeCodeServiceImpl. The backup hooks
 * run before file modification tools (Write, Edit, MultiEdit) and create backups
 * in the `.claude/.edit-baks/{session_id}/` directory structure.
 *
 * @see packages/ai-claude-code/src/node/claude-code-service-impl.ts#ensureFileBackupHook
 * The coupling with the backup hooks is intentional - this service reads from
 * the same backup location that the hooks write to.
 */
export interface FileEditBackupService {
    /**
     * Retrieves the original content of a file from its backup.
     *
     * This method reads from backup files created by the file backup hooks
     * that are installed by ClaudeCodeServiceImpl.ensureFileBackupHook().
     *
     * @param workspaceUri The URI of the file to get backup content for
     * @param sessionId The Claude session ID used for backup organization
     * @returns The original file content, or undefined if no backup exists
     */
    getOriginal(workspaceUri: URI, sessionId: string | undefined): Promise<string | undefined>;

    /**
     * Cleans up backup files for a completed chat session.
     *
     * This method removes the backup directory structure for the given session
     * from all workspaces that have change set elements.
     *
     * @param request The chat request model containing session and change set information
     */
    cleanUp(request: MutableChatRequestModel): Promise<void>;

    /**
     * Gets the backup location for a workspace root.
     *
     * This must match the backup location used by the file backup hooks
     * in ClaudeCodeServiceImpl.
     *
     * @param workspaceRoot The workspace root URI
     * @returns The backup directory URI
     */
    getLocation(workspaceRoot: URI): URI;
}

@injectable()
export class FileEditBackupServiceImpl implements FileEditBackupService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(ILogger) @named('claude-code')
    protected readonly logger: ILogger;

    getLocation(workspaceRoot: URI): URI {
        // This path structure must match the backup hooks in claude-code-service-impl.ts
        // See ensureFileBackupHook() method which creates backups at:
        // path.join(hookData.cwd, '.claude', '.edit-baks', hookData.session_id)
        return workspaceRoot.resolve('.claude').resolve('.edit-baks');
    }

    async getOriginal(workspaceUri: URI, sessionId: string | undefined): Promise<string | undefined> {
        if (!sessionId) {
            return undefined;
        }

        try {
            const workspaceRoot = this.workspaceService.getWorkspaceRootUri(workspaceUri);
            if (!workspaceRoot) {
                return undefined;
            }

            const relativePath = await this.workspaceService.getWorkspaceRelativePath(workspaceUri);
            // This path structure must match the backup hooks in claude-code-service-impl.ts
            const backupPath = this.getLocation(workspaceRoot).resolve(sessionId).resolve(relativePath);

            if (await this.fileService.exists(backupPath)) {
                const backupContent = await this.fileService.read(backupPath);
                return backupContent.value.toString();
            }
        } catch (error) {
            this.logger.error('Error reading backup file:', error);
        }

        return undefined;
    }

    async cleanUp(request: MutableChatRequestModel): Promise<void> {
        const sessionId = request.getDataByKey(CLAUDE_SESSION_ID_KEY) as string | undefined;
        if (!sessionId) {
            return;
        }
        if (request.session.changeSet.getElements().length < 1) {
            return;
        }

        const workspaceUris = new Set<URI>();
        request.session.changeSet.getElements()
            .filter((element): element is ChangeSetFileElement => element instanceof ChangeSetFileElement)
            .map(element => this.workspaceService.getWorkspaceRootUri(element.uri))
            .filter((element): element is URI => element !== undefined)
            .forEach(element => workspaceUris.add(element));

        for (const workspaceUri of workspaceUris) {
            const backupLocation = this.getLocation(workspaceUri).resolve(sessionId);
            try {
                await this.fileService.delete(backupLocation, { recursive: true });
            } catch (error) {
                // Ignore cleanup errors - not critical
            }
        }
    }
}
