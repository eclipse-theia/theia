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
import { AbstractRemoteRegistryContribution, RemoteRegistry } from '@theia/remote/lib/electron-browser/remote-registry-contribution';
import { LastContainerInfo, RemoteContainerConnectionProvider } from '../electron-common/remote-container-connection-provider';
import { RemotePreferences } from '@theia/remote/lib/electron-browser/remote-preferences';
import { WorkspaceStorageService } from '@theia/workspace/lib/browser/workspace-storage-service';
import { Command, QuickInputService } from '@theia/core';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ContainerOutputProvider } from './container-output-provider';

export namespace RemoteContainerCommands {
    export const REOPEN_IN_CONTAINER = Command.toLocalizedCommand({
        id: 'dev-container:reopen-in-container',
        label: 'Reopen in Container',
        category: 'Dev Container'
    }, 'theia/dev-container/connect');
}

const LAST_USED_CONTAINER = 'lastUsedContainer';
@injectable()
export class ContainerConnectionContribution extends AbstractRemoteRegistryContribution {

    @inject(RemoteContainerConnectionProvider)
    protected readonly connectionProvider: RemoteContainerConnectionProvider;

    @inject(RemotePreferences)
    protected readonly remotePreferences: RemotePreferences;

    @inject(WorkspaceStorageService)
    protected readonly workspaceStorageService: WorkspaceStorageService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(ContainerOutputProvider)
    protected readonly containerOutputProvider: ContainerOutputProvider;

    registerRemoteCommands(registry: RemoteRegistry): void {
        registry.registerCommand(RemoteContainerCommands.REOPEN_IN_CONTAINER, {
            execute: () => this.openInContainer()
        });
    }

    async openInContainer(): Promise<void> {
        const devcontainerFile = await this.getOrSelectDevcontainerFile();
        if (!devcontainerFile) {
            return;
        }
        const lastContainerInfoKey = `${LAST_USED_CONTAINER}:${devcontainerFile}`;
        const lastContainerInfo = await this.workspaceStorageService.getData<LastContainerInfo | undefined>(lastContainerInfoKey);

        this.containerOutputProvider.openChannel();

        const connectionResult = await this.connectionProvider.connectToContainer({
            nodeDownloadTemplate: this.remotePreferences['remote.nodeDownloadTemplate'],
            lastContainerInfo,
            devcontainerFile
        });

        this.workspaceStorageService.setData<LastContainerInfo>(lastContainerInfoKey, {
            id: connectionResult.containerId,
            lastUsed: Date.now()
        });

        this.openRemote(connectionResult.port, false, connectionResult.workspacePath);
    }

    async getOrSelectDevcontainerFile(): Promise<string | undefined> {
        const devcontainerFiles = await this.connectionProvider.getDevContainerFiles();

        if (devcontainerFiles.length === 1) {
            return devcontainerFiles[0].path;
        }

        return (await this.quickInputService.pick(devcontainerFiles.map(file => ({
            type: 'item',
            label: file.name,
            description: file.path,
            file: file.path,
        })), {
            title: 'Select a devcontainer.json file'
        }))?.file;
    }

}
