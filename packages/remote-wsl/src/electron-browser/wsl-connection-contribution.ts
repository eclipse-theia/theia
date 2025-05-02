// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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
import { RemotePreferences } from '@theia/remote/lib/electron-browser/remote-preferences';
import { WorkspaceStorageService } from '@theia/workspace/lib/browser/workspace-storage-service';
import { Command, MaybePromise, QuickInputService, URI, isWindows } from '@theia/core';
import { WorkspaceInput, WorkspaceOpenHandlerContribution, WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { WorkspaceServer } from '@theia/workspace/lib/common';
import { RemoteWslConnectionProvider, WslDistribution } from '../electron-common/remote-wsl-connection-provider';

export namespace RemoteWslCommands {
    export const REOPEN_IN_WSL = Command.toLocalizedCommand({
        id: 'remote-wsl:reopen-in-wsl',
        label: 'Reopen in WSL',
        category: 'WSL'
    }, 'theia/remote-wsl/connect');
}

const LAST_USED_DISTRIBUTION = 'lastUsedWslDistribution';
@injectable()
export class WslConnectionContribution extends AbstractRemoteRegistryContribution implements WorkspaceOpenHandlerContribution {

    @inject(RemoteWslConnectionProvider)
    protected readonly connectionProvider: RemoteWslConnectionProvider;

    @inject(RemotePreferences)
    protected readonly remotePreferences: RemotePreferences;

    @inject(WorkspaceStorageService)
    protected readonly workspaceStorageService: WorkspaceStorageService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(WorkspaceServer)
    protected readonly workspaceServer: WorkspaceServer;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    registerRemoteCommands(registry: RemoteRegistry): void {
        if (!isWindows) {
            // ignore this feature on non-Windows platforms
            return;
        }
        registry.registerCommand(RemoteWslCommands.REOPEN_IN_WSL, {
            execute: () => this.openInWsl()
        });
    }

    async openInWsl(): Promise<void> {
        const distribution = await this.getOrSelectWslDistribution();
        if (!distribution) {
            return;
        }
        this.doOpenInWsl(distribution);
    }

    async doOpenInWsl(distribution: WslDistribution): Promise<void> {
        const lastDistributionKey = `${LAST_USED_DISTRIBUTION}:${distribution.name}`;
        // const lastDistributionInfo = await this.workspaceStorageService.getData<{ lastUsed: number } | undefined>(lastDistributionKey);

        const connectionResult = await this.connectionProvider.connectToWsl({
            nodeDownloadTemplate: this.remotePreferences['remote.nodeDownloadTemplate'],
            distribution: distribution.name,
            workspacePath: this.workspaceService.workspace?.resource.path?.fsPath()
        });

        this.workspaceStorageService.setData(lastDistributionKey, {
            lastUsed: Date.now()
        });

        this.openRemote(connectionResult.port.toString(), false, connectionResult.workspacePath);
    }

    async getOrSelectWslDistribution(): Promise<WslDistribution | undefined> {
        const distributions = await this.connectionProvider.getWslDistributions();

        if (distributions.length === 1) {
            return distributions[0];
        }

        return (await this.quickInputService.pick(distributions.map(dist => ({
            type: 'item',
            label: dist.name,
            description: dist.default ? 'Default' : dist.version,
            distribution: dist,
        })), {
            title: 'Select a WSL distribution'
        }))?.distribution;
    }

    canHandle(uri: URI): MaybePromise<boolean> {
        return false; // WSL doesn't use a special URI scheme
    }

    async openWorkspace(uri: URI, options?: WorkspaceInput): Promise<void> {
        // Not implemented as WSL doesn't use a special URI scheme
    }

    async getWorkspaceLabel(uri: URI): Promise<string | undefined> {
        return `[WSL] ${uri.path.base}`;
    }
};
