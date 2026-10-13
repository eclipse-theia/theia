// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { Path, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

/**
 * Resolves the relative paths of files in the workspace that AI features, e.g. chat variables, refer to.
 */
@injectable()
export class WorkspaceRelativePathResolver {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    /**
     * Resolves a relative path to an existing file or folder in the workspace. Besides the format of
     * {@link WorkspaceService.getRootPrefixedPath}, it accepts the formats of paths saved by earlier versions,
     * e.g. in chat sessions, or before the workspace roots changed: in the format of
     * {@link WorkspaceService.resolveSupraRelativePath}, if only one of the roots contains the file, or relative to any root.
     *
     * @returns `undefined` if the path is absolute, leaves its root or does not resolve to an existing file or folder.
     */
    async resolveExistingRelativePath(relativePath: string): Promise<URI | undefined> {
        const normalizedPath = Path.normalizePathSeparator(relativePath);
        const path = new Path(normalizedPath).normalize();
        const segments = path.toString().split('/').filter(segment => segment.length > 0);
        if (path.isAbsolute || Path.isDrive(segments[0] ?? '') || segments.includes('..')) {
            return undefined;
        }
        const rootPrefixed = this.workspaceService.resolveRootPrefixedPath(normalizedPath);
        if (rootPrefixed && await this.fileService.exists(rootPrefixed)) {
            return rootPrefixed;
        }
        const supraRelative: URI[] = [];
        for (const uri of this.workspaceService.resolveSupraRelativePath(normalizedPath)) {
            if (await this.fileService.exists(uri)) {
                supraRelative.push(uri);
            }
        }
        if (supraRelative.length === 1) {
            return supraRelative[0];
        }
        const roots = this.workspaceService.tryGetRoots();
        for (const root of roots) {
            const uri = root.resource.resolve(segments.join('/'));
            if (await this.fileService.exists(uri)) {
                return uri;
            }
        }
        return undefined;
    }
}
