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
import { Command, MessageService, QuickInputService, URI, isWindows, nls } from '@theia/core';
import { WorkspaceInput, WorkspaceOpenHandlerContribution, WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { WorkspaceServer } from '@theia/workspace/lib/common';
import { RemoteWslConnectionProvider, WslDistribution } from '../electron-common/remote-wsl-connection-provider';
import { WSL_WORKSPACE_SCHEME } from '../electron-common/wsl-workspaces';

export namespace RemoteWslCommands {
    export const CONNECT_TO_WSL = Command.toLocalizedCommand({
        id: 'remote-wsl.connect-to-wsl',
        label: 'Connect to WSL',
        category: 'WSL'
    }, 'theia/remote/wsl/connectToWsl');

    export const CONNECT_TO_WSL_WITH_DISTRO = Command.toLocalizedCommand({
        id: 'remote-wsl.connect-to-wsl-with-distro',
        label: 'Connect to WSL using Distro...',
        category: 'WSL'
    }, 'theia/remote/wsl/connectToWslUsingDistro');

    export const OPEN_CURRENT_FOLDER_IN_WSL = Command.toLocalizedCommand({
        id: 'remote-wsl.open-current-folder-in-wsl',
        label: 'Reopen Folder in WSL',
        category: 'WSL'
    }, 'theia/remote/wsl/reopenInWsl');
}

@injectable()
export class WslConnectionContribution extends AbstractRemoteRegistryContribution implements
    WorkspaceOpenHandlerContribution, WorkspaceOpenHandlerContribution {

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

    @inject(MessageService)
    protected readonly messageService: MessageService;

    registerRemoteCommands(registry: RemoteRegistry): void {
        if (!isWindows) {
            // ignore this feature on non-Windows platforms
            return;
        }
        registry.registerCommand(RemoteWslCommands.CONNECT_TO_WSL, {
            execute: () => {
                this.connectionProvider.getWslDistributions().then(distributions => {
                    const defaultDistro = distributions.find(dist => dist.default);
                    if (defaultDistro) {
                        this.connectToWSL(defaultDistro);
                    } else {
                        this.getOrSelectWslDistribution().then(distribution => {
                            if (distribution) {
                                this.connectToWSL(distribution);
                            }
                        });
                    }
                });
            }
        });

        registry.registerCommand(RemoteWslCommands.CONNECT_TO_WSL_WITH_DISTRO, {
            execute: () => this.getOrSelectWslDistribution().then(distribution => {
                if (distribution) {
                    this.connectToWSL(distribution);
                }
            })
        });

        registry.registerCommand(RemoteWslCommands.OPEN_CURRENT_FOLDER_IN_WSL, {
            execute: () => this.getOrSelectWslDistribution().then(distribution => {
                if (distribution) {
                    const workspacePath = this.workspaceService.workspace?.resource.path.fsPath();
                    if (workspacePath) {
                        this.connectToWSL(distribution, this.toWSLMountPath(workspacePath));
                    }
                }
            }),
            isVisible: () => !!this.workspaceService.workspace
        });
    }

    async connectToWSL(distribution: WslDistribution, workspace?: string, preserveWindow = true): Promise<void> {
        const connectionResult = await this.connectionProvider.connectToWsl({
            nodeDownloadTemplate: this.remotePreferences['remote.nodeDownloadTemplate'],
            distribution: distribution.name,
            workspacePath: this.workspaceService.workspace?.resource.path?.fsPath()
        });

        if (workspace) {
            this.workspaceServer.setMostRecentlyUsedWorkspace(
                `${WSL_WORKSPACE_SCHEME}:${workspace}?distro=${distribution.name}`
            );
        }

        this.openRemote(connectionResult.port.toString(), !preserveWindow, workspace);
    }

    async getOrSelectWslDistribution(): Promise<WslDistribution | undefined> {
        const distributions = await this.connectionProvider.getWslDistributions();

        if (distributions.length === 0) {
            this.messageService.error(nls.localize('theia/remote/wsl/noWslDistroFound', 'No WSL distributions found. Please install a WSL distribution first.'));
            return undefined;
        }

        if (distributions.length === 1) {
            return distributions[0];
        }

        return (await this.quickInputService.pick(distributions.map(dist => ({
            type: 'item',
            label: dist.name,
            description: dist.default ? nls.localizeByDefault('Default') : dist.version,
            distribution: dist,
        })), {
            title: nls.localize('theia/remote/wsl/selectWSLDistro', 'Select a WSL distribution')
        }))?.distribution;
    }

    canHandle(uri: URI): boolean {
        return uri.scheme === WSL_WORKSPACE_SCHEME; // WSL doesn't use a special URI scheme
    }

    async openWorkspace(uri: URI, options?: WorkspaceInput | undefined): Promise<void> {
        const workspacePath = uri.path.toString();
        const distroName = new URLSearchParams(uri.query).get('distro');
        if (distroName) {
            const distros = await this.connectionProvider.getWslDistributions();
            const distro = distros.find(d => d.name === distroName);
            if (!distro) {
                throw new Error(`Invalid WSL workspace URI. Distribution ${distroName} not found.`);
            }
            this.connectToWSL(distro, workspacePath, options?.preserveWindow);
        }
        throw new Error('Invalid WSL workspace URI. No distrubution specified.');
    }

    async getWorkspaceLabel(uri: URI): Promise<string | undefined> {
        return `[WSL] ${uri.path.base}`;
    }

    protected toWSLMountPath(path: string): string {
        const driveLetter = path.charAt(0).toLowerCase();
        const wslPath = path.replace(/^[a-zA-Z]:\\/, `/mnt/${driveLetter}/`);
        return wslPath.replace(/\\/g, '/');
    }
};
