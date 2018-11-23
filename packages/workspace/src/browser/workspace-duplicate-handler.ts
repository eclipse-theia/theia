/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import URI from '@theia/core/lib/common/uri';
import { injectable, inject } from 'inversify';
import { WorkspaceUtils } from './workspace-utils';
import { WorkspaceService } from './workspace-service';
import { FileSystem } from '@theia/filesystem/lib/common/filesystem';
import { UriCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { FileSystemUtils } from '@theia/filesystem/lib/common/filesystem-utils';

@injectable()
export class WorkspaceDuplicateHandler implements UriCommandHandler<URI[]> {

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(WorkspaceUtils)
    protected readonly workspaceUtils: WorkspaceUtils;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    /**
     * Determine if the command is visible.
     *
     * @param uris URIs of selected resources.
     * @returns `true` if the command is visible.
     */
    isVisible(uris: URI[]): boolean {
        return !!uris.length && !this.workspaceUtils.containsRootDirectory(uris);
    }

    /**
     * Determine if the command is enabled.
     *
     * @param uris URIs of selected resources.
     * @returns `true` if the command is enabled.
     */
    isEnabled(uris: URI[]): boolean {
        return !!uris.length && !this.workspaceUtils.containsRootDirectory(uris);
    }

    /**
     * Execute the command.
     *
     * @param uris URIs of selected resources.
     */
    async execute(uris: URI[]): Promise<void> {
        await Promise.all(uris.map(async uri => {
            const parent = await this.fileSystem.getFileStat(uri.parent.toString());
            if (parent) {
                const parentUri = new URI(parent.uri);
                const name = uri.path.name + '_copy';
                const ext = uri.path.ext;
                const target = FileSystemUtils.generateUniqueResourceURI(parentUri, parent, name, ext);
                try {
                    this.fileSystem.copy(uri.toString(), target.toString());
                } catch (e) {
                    console.error(e);
                }
            }
        }));
    }

}
