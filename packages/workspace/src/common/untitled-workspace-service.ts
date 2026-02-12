// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MaybePromise } from '@theia/core';
import { WorkspaceFileService } from './workspace-file-service';

@injectable()
export class UntitledWorkspaceService {

    @inject(WorkspaceFileService)
    protected readonly workspaceFileService: WorkspaceFileService;

    /**
     * Check if a URI is an untitled workspace.
     * @param candidate The URI to check
     * @param configDirUri Optional config directory URI. If provided, also verifies
     *                     that the candidate is under the expected workspaces directory.
     *                     This is the secure check and should be used when possible.
     */
    isUntitledWorkspace(candidate?: URI, configDirUri?: URI): boolean {
        if (!candidate || !this.workspaceFileService.isWorkspaceFile(candidate)) {
            return false;
        }
        if (!candidate.path.base.startsWith('Untitled')) {
            return false;
        }
        // If configDirUri is provided, verify the candidate is in the expected location
        if (configDirUri) {
            const expectedParentDir = configDirUri.resolve('workspaces');
            return expectedParentDir.isEqualOrParent(candidate);
        }
        // Without configDirUri, fall back to name-only check (less secure)
        return true;
    }

    async getUntitledWorkspaceUri(configDirUri: URI, isAcceptable: (candidate: URI) => MaybePromise<boolean>, warnOnHits?: () => unknown): Promise<URI> {
        const parentDir = configDirUri.resolve('workspaces');
        const workspaceExtensions = this.workspaceFileService.getWorkspaceFileExtensions();
        const defaultFileExtension = workspaceExtensions[this.workspaceFileService.defaultFileTypeIndex];
        let uri;
        let attempts = 0;
        do {
            attempts++;
            uri = parentDir.resolve(`Untitled-${Math.round(Math.random() * 1000)}.${defaultFileExtension}`);
            if (attempts === 10) {
                warnOnHits?.();
            }
            if (attempts === 50) {
                throw new Error('Workspace Service: too many attempts to find unused filename.');
            }
        } while (!(await isAcceptable(uri)));
        return uri;
    }
}
