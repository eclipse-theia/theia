// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
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
import * as fs from '@theia/core/shared/fs-extra';
import { injectable } from '@theia/core/shared/inversify';
import { WorkspaceHandlerContribution } from '@theia/workspace/lib/node/default-workspace-server';
import { DEV_CONTAINER_PATH_QUERY, DEV_CONTAINER_WORKSPACE_SCHEME } from '../electron-common/dev-container-workspaces';

@injectable()
export class DevContainerWorkspaceHandler implements WorkspaceHandlerContribution {

    canHandle(uri: URI): boolean {
        return uri.scheme === DEV_CONTAINER_WORKSPACE_SCHEME;
    }

    async workspaceStillExists(uri: URI): Promise<boolean> {
        const devcontainerFile = new URLSearchParams(uri.query).get(DEV_CONTAINER_PATH_QUERY);
        return await fs.pathExists(uri.path.fsPath()) && !!devcontainerFile && fs.pathExists(devcontainerFile);
    }
}
