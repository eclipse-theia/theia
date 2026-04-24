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
import { URI } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ContextFileValidationService, FileValidationResult, FileValidationState } from '@theia/ai-chat/lib/browser/context-file-validation-service';
import { WorkspaceFunctionScope } from './workspace-functions';

@injectable()
export class ContextFileValidationServiceImpl implements ContextFileValidationService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceScope: WorkspaceFunctionScope;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    async validateFile(pathOrUri: string | URI): Promise<FileValidationResult> {
        try {
            const resolvedUri = await this.workspaceScope.resolveToUri(pathOrUri);

            if (!resolvedUri) {
                return {
                    state: FileValidationState.INVALID_NOT_FOUND,
                    message: 'File does not exist'
                };
            }

            const exists = await this.fileService.exists(resolvedUri);
            if (!exists) {
                return {
                    state: FileValidationState.INVALID_NOT_FOUND,
                    message: 'File does not exist'
                };
            }

            if (this.workspaceScope.isInWorkspace(resolvedUri)) {
                return {
                    state: FileValidationState.VALID
                };
            }

            return {
                state: FileValidationState.INVALID_NOT_FOUND,
                message: 'File does not exist in the workspace'
            };
        } catch (error) {
            return {
                state: FileValidationState.INVALID_NOT_FOUND,
                message: 'File does not exist'
            };
        }
    }
}
