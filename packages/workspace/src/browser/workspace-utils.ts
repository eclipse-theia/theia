
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

// TODO get rid of util files, replace with methods in a responsible class

import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceService } from './workspace-service';

/**
 * Collection of workspace utility functions
 * @class
 */
@injectable()
export class WorkspaceUtils {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    /**
     * Determine if root directory exists
     * for a given array of URIs
     * @param uris
     */
    containsRootDirectory(uris: URI[]): boolean {
        // obtain all roots URIs for a given workspace
        const rootUris = this.workspaceService.tryGetRoots().map(root => root.resource);
        // return true if at least a single URI is a root directory
        return rootUris.some(rootUri => uris.some(uri => uri.isEqualOrParent(rootUri)));
    }
}
