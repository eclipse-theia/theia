// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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
// ****************************************************************************
import { URI } from '@theia/core';
import * as fs from '@theia/core/shared/fs-extra';
import { WorkspaceHandlerContribution } from '@theia/workspace/lib/node/default-workspace-server';

export class WslWorkspaceHandler implements WorkspaceHandlerContribution {
    canHandle(uri: URI): boolean {
        return uri.scheme === 'wsl';
    }
    workspaceStillExists(uri: URI): Promise<boolean> {
        return fs.pathExists(this.toWindowsPath(uri.path.toString()));
    }

    private toWindowsPath(path: string): string {
        const match = path.match(/^\/mnt\/([a-z])\/(.*)/i);
        if (match) {
            const driveLetter = match[1].toUpperCase();
            const windowsPath = match[2].replace(/\//g, '\\');
            return `${driveLetter}:\\${windowsPath}`;
        }
        return path;
    }

}
