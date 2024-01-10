// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { UserWorkingDirectoryProvider } from '@theia/core/lib/browser/user-working-directory-provider';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from './workspace-service';
import { MaybePromise } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

@injectable()
export class WorkspaceUserWorkingDirectoryProvider extends UserWorkingDirectoryProvider {
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FileService) protected readonly fileService: FileService;

    override async getUserWorkingDir(): Promise<URI> {
        return await this.getFromSelection()
            ?? await this.getFromLastOpenResource()
            ?? await this.getFromWorkspace()
            ?? this.getFromUserHome();
    }

    protected getFromWorkspace(): MaybePromise<URI | undefined> {
        return this.workspaceService.tryGetRoots()[0]?.resource;
    }

    protected override async ensureIsDirectory(uri?: URI): Promise<URI | undefined> {
        if (uri) {
            const asFile = uri.withScheme('file');
            const stat = await this.fileService.resolve(asFile)
                .catch(() => this.fileService.resolve(asFile.parent))
                .catch(() => undefined);
            return stat?.isDirectory ? stat.resource : stat?.resource.parent;
        }
    }
}
