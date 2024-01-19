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
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceServer } from '@theia/workspace/lib/common';
import * as fs from '@theia/core/shared/fs-extra';
import * as Docker from 'dockerode';

@injectable()
export class DockerContainerCreationService {

    @inject(WorkspaceServer)
    protected readonly workspaceServer: WorkspaceServer;

    async buildContainer(docker: Docker, from?: URI): Promise<Docker.Container> {
        const workspace = from ?? new URI(await this.workspaceServer.getMostRecentlyUsedWorkspace());
        if (!workspace) {
            throw new Error('No workspace');
        }

        const devcontainerFile = workspace.resolve('.devcontainer/devcontainer.json');
        const devcontainerConfig = JSON.parse(await fs.readFile(devcontainerFile.path.fsPath(), 'utf-8'));

        // TODO add more config
        const container = docker.createContainer({
            Image: devcontainerConfig.image,
        });

        return container;
    }
}
