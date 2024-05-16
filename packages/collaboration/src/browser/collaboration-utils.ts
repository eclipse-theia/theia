// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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
import { inject, injectable } from '@theia/core/shared/inversify';
import { CollaborationWorkspaceService } from './collaboration-workspace-service';

@injectable()
export class CollaborationUtils {

    @inject(CollaborationWorkspaceService)
    protected readonly workspaceService: CollaborationWorkspaceService;

    getProtocolPath(uri?: URI): string | undefined {
        if (!uri) {
            return undefined;
        }
        const path = uri.path.toString();
        const roots = this.workspaceService.tryGetRoots();
        for (const root of roots) {
            const rootUri = root.resource.path.toString() + '/';
            if (path.startsWith(rootUri)) {
                return root.name + '/' + path.substring(rootUri.length);
            }
        }
        return undefined;
    }

    getResourceUri(path?: string): URI | undefined {
        if (!path) {
            return undefined;
        }
        const parts = path.split('/');
        const root = parts[0];
        const rest = parts.slice(1);
        const stat = this.workspaceService.tryGetRoots().find(e => e.name === root);
        if (stat) {
            const uriPath = stat.resource.path.join(...rest);
            const uri = stat.resource.withPath(uriPath);
            return uri;
        } else {
            return undefined;
        }
    }

}
