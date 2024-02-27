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
import { Command } from '@theia/core';

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
    private workspaceStorageService: WorkspaceStorageService;

    registerRemoteCommands(registry: RemoteRegistry): void {
        registry.registerCommand(RemoteContainerCommands.REOPEN_IN_CONTAINER, {
            execute: () => this.openInContainer()
        });

    }

    async openInContainer(): Promise<void> {
        const lastContainerInfo = await this.workspaceStorageService.getData<LastContainerInfo | undefined>(LAST_USED_CONTAINER);

        const connectionResult = await this.connectionProvider.connectToContainer({
            nodeDownloadTemplate: this.remotePreferences['remote.nodeDownloadTemplate'],
            lastContainerInfo
        });

        this.workspaceStorageService.setData<LastContainerInfo>(LAST_USED_CONTAINER, {
            id: connectionResult.containerId,
            port: connectionResult.containerPort,
            lastUsed: Date.now()
        });

        this.openRemote(connectionResult.port, false, connectionResult.workspacePath);
    }

}
