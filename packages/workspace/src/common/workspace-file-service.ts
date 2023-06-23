// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { URI } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { FileStat } from '@theia/filesystem/lib/common/files';

export interface WorkspaceFileType {
    extension: string
    name: string
}

/**
 * @deprecated Since 1.39.0. Use `WorkspaceFileService#getWorkspaceFileTypes` instead.
 */
export const THEIA_EXT = 'theia-workspace';
/**
 * @deprecated Since 1.39.0. Use `WorkspaceFileService#getWorkspaceFileTypes` instead.
 */
export const VSCODE_EXT = 'code-workspace';

@injectable()
export class WorkspaceFileService {

    protected _defaultFileTypeIndex = 0;

    get defaultFileTypeIndex(): number {
        return this._defaultFileTypeIndex;
    }

    /**
     * Check if the file should be considered as a workspace file.
     *
     * Example: We should not try to read the contents of an .exe file.
     */
    isWorkspaceFile(candidate: FileStat | URI): boolean {
        const uri = FileStat.is(candidate) ? candidate.resource : candidate;
        const extensions = this.getWorkspaceFileExtensions(true);
        return extensions.includes(uri.path.ext);
    }

    getWorkspaceFileTypes(): WorkspaceFileType[] {
        return [
            {
                name: 'Theia',
                extension: THEIA_EXT
            },
            {
                name: 'Visual Studio Code',
                extension: VSCODE_EXT
            }
        ];
    }

    getWorkspaceFileExtensions(dot?: boolean): string[] {
        return this.getWorkspaceFileTypes().map(type => dot ? `.${type.extension}` : type.extension);
    }

}
