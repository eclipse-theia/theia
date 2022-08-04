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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

// TODO get rid of util files, replace with methods in a responsible class

import URI from '@theia/core/lib/common/uri';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { injectable } from '@theia/core/shared/inversify';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { MaybePromise } from '@theia/core';

export const THEIA_EXT = 'theia-workspace';
export const VSCODE_EXT = 'code-workspace';

/**
 * @deprecated since 1.4.0 - because of https://github.com/eclipse-theia/theia/tree/master/doc/coding-guidelines.md#di-function-export,
 * use `WorkspaceService.getUntitledWorkspace` instead
 */
export async function getTemporaryWorkspaceFileUri(envVariableServer: EnvVariablesServer): Promise<URI> {
    const configDirUri = await envVariableServer.getConfigDirUri();
    return new URI(configDirUri).resolve(`Untitled.${THEIA_EXT}`);
}

@injectable()
export class CommonWorkspaceUtils {
    /**
     * Check if the file should be considered as a workspace file.
     *
     * Example: We should not try to read the contents of an .exe file.
     */
    isWorkspaceFile(candidate: FileStat | URI): boolean {
        const uri = FileStat.is(candidate) ? candidate.resource : candidate;
        return uri.path.ext === `.${THEIA_EXT}` || uri.path.ext === `.${VSCODE_EXT}`;
    }

    isUntitledWorkspace(candidate?: URI): boolean {
        return !!candidate && this.isWorkspaceFile(candidate) && candidate.path.base.startsWith('Untitled');
    }

    async getUntitledWorkspaceUri(configDirUri: URI, isAcceptable: (candidate: URI) => MaybePromise<boolean>, warnOnHits?: () => unknown): Promise<URI> {
        const parentDir = configDirUri.resolve('workspaces');
        let uri;
        let attempts = 0;
        do {
            attempts++;
            uri = parentDir.resolve(`Untitled-${Math.round(Math.random() * 1000)}.${THEIA_EXT}`);
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
