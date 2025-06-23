// *****************************************************************************
// Copyright (C) 2025 and others.
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
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { type DebugSessionOptions } from './debug-session-options';

/**
 * Provides a label for the debug session without the need to create the session.
 * Debug session labels are used to check if sessions are the "same".
 */
@injectable()
export class DebugSessionConfigurationLabelProvider {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    // https://github.com/microsoft/vscode/blob/907518a25c6d6b9467cbcc57132c6adb7e7396b0/src/vs/workbench/contrib/debug/browser/debugSession.ts#L253-L256
    getLabel(
        params: Pick<DebugSessionOptions, 'name' | 'workspaceFolderUri'>,
        includeRoot = this.workspaceService.tryGetRoots().length > 1
    ): string {
        let { name, workspaceFolderUri } = params;
        if (includeRoot && workspaceFolderUri) {
            const uri = new URI(workspaceFolderUri);
            const path = uri.path;
            const basenameOrAuthority = path.name || uri.authority;
            name += ` (${basenameOrAuthority})`;
        }
        return name;
    }
}
