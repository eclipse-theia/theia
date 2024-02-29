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

import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceServer } from '@theia/workspace/lib/common';
import { DevContainerFile } from '../electron-common/remote-container-connection-provider';
import { DevContainerConfiguration } from './devcontainer-file';
import { parse } from 'jsonc-parser';
import * as fs from '@theia/core/shared/fs-extra';
import { URI } from '@theia/core';

@injectable()
export class DevContainerFileService {

    @inject(WorkspaceServer)
    protected readonly workspaceServer: WorkspaceServer;

    async getConfiguration(path: string): Promise<DevContainerConfiguration> {
        const configuration: DevContainerConfiguration = parse(await fs.readFile(path, 'utf-8').catch(() => '0')) as DevContainerConfiguration;
        if (!configuration) {
            throw new Error(`devcontainer file ${path} could not be parsed`);
        }

        configuration.location = path;
        return configuration;
    }

    async getAvailableFiles(): Promise<DevContainerFile[]> {
        const workspace = await this.workspaceServer.getMostRecentlyUsedWorkspace();
        if (!workspace) {
            return [];
        }

        const devcontainerPath = new URI(workspace).path.join('.devcontainer');

        const files = await fs.readdir(devcontainerPath.fsPath());
        return files.flatMap(filename => {
            const fileStat = fs.statSync(devcontainerPath.join(filename).fsPath());
            return fileStat.isDirectory() ?
                fs.readdirSync(devcontainerPath.join(filename).fsPath()).map(inner => devcontainerPath.join(filename).join(inner).fsPath()) :
                [devcontainerPath.join(filename).fsPath()];
        })
            .filter(file => file.endsWith('devcontainer.json'))
            .map(file => ({
                name: parse(fs.readFileSync(file, 'utf-8')).name ?? 'devcontainer',
                path: file
            }));

    }
}
