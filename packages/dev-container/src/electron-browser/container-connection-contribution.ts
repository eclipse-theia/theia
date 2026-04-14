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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AbstractRemoteRegistryContribution, RemoteRegistry } from '@theia/remote/lib/electron-browser/remote-registry-contribution';
import { DevContainerFile, LastContainerInfo, RemoteContainerConnectionProvider } from '../electron-common/remote-container-connection-provider';
import { WorkspaceStorageService } from '@theia/workspace/lib/browser/workspace-storage-service';
import { Command, MaybePromise, MessageService, nls, QuickInputService, URI } from '@theia/core';
import { WorkspaceInput, WorkspaceOpenHandlerContribution, WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ContainerOutputProvider } from './container-output-provider';
import { WorkspaceServer } from '@theia/workspace/lib/common';
import { DEV_CONTAINER_PATH_QUERY, DEV_CONTAINER_WORKSPACE_SCHEME } from '../electron-common/dev-container-workspaces';
import { RemotePreferences } from '@theia/remote/lib/electron-common/remote-preferences';
import { LocalStorageService } from '@theia/core/lib/browser';

export namespace RemoteContainerCommands {
    export const REOPEN_IN_CONTAINER = Command.toLocalizedCommand({
        id: 'dev-container:reopen-in-container',
        label: 'Reopen in Container',
        category: 'Dev Container'
    }, 'theia/remote/dev-container/connect');

    export const ATTACH_TO_CONTAINER = Command.toLocalizedCommand({
        id: 'dev-container:attach-to-container',
        label: 'Attach to Running Container',
        category: 'Dev Container'
    }, 'theia/remote/dev-container/attach');

    export const REBUILD_CONTAINER = Command.toLocalizedCommand({
        id: 'dev-container:rebuild-container',
        label: 'Rebuild Container',
        category: 'Dev Container'
    }, 'theia/remote/dev-container/rebuild');
}

const LAST_USED_CONTAINER = 'lastUsedContainer';
const ACTIVE_DEV_CONTAINER_CONTEXT = 'activeDevContainerContext';

interface DevContainerContext {
    devcontainerFilePath: string;
    devcontainerFileName: string;
    hostWorkspacePath: string;
    containerId: string;
}
@injectable()
export class ContainerConnectionContribution extends AbstractRemoteRegistryContribution implements WorkspaceOpenHandlerContribution {

    @inject(RemoteContainerConnectionProvider)
    protected readonly connectionProvider: RemoteContainerConnectionProvider;

    @inject(RemotePreferences)
    protected readonly remotePreferences: RemotePreferences;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(WorkspaceStorageService)
    protected readonly workspaceStorageService: WorkspaceStorageService;

    @inject(LocalStorageService)
    protected readonly storageService: LocalStorageService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(WorkspaceServer)
    protected readonly workspaceServer: WorkspaceServer;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(ContainerOutputProvider)
    protected readonly containerOutputProvider: ContainerOutputProvider;

    protected hasDevContainerFiles = false;

    @postConstruct()
    protected init(): void {
        // Mark that we're in a remote session. sessionStorage survives page
        // reloads (disconnect) but is cleared on window close (restart).
        // This lets canHandle() distinguish disconnect from restart.
        if (this.isRemoteSession()) {
            sessionStorage.setItem('devcontainer:wasRemote', 'true');
        }
        this.workspaceService.ready.then(() => this.checkForDevContainerFiles());
        this.workspaceService.onWorkspaceChanged(() => this.checkForDevContainerFiles());
    }

    protected async checkForDevContainerFiles(): Promise<void> {
        if (this.isRemoteSession()) {
            this.hasDevContainerFiles = true;
            return;
        }
        const workspace = this.workspaceService.workspace;
        if (!workspace) {
            this.hasDevContainerFiles = false;
            return;
        }
        try {
            const files = await this.connectionProvider.getDevContainerFiles(workspace.resource.path.toString());
            this.hasDevContainerFiles = files.length > 0;
        } catch (error) {
            // Failed to check for devcontainer files, assume none exist
            this.hasDevContainerFiles = false;
        }
    }

    registerRemoteCommands(registry: RemoteRegistry): void {
        registry.registerCommand(RemoteContainerCommands.REOPEN_IN_CONTAINER, {
            execute: () => this.openInContainer(),
            isVisible: () => !this.isRemoteSession() && this.hasDevContainerFiles
        });
        registry.registerCommand(RemoteContainerCommands.ATTACH_TO_CONTAINER, {
            execute: () => this.attachToContainer()
        });
        registry.registerCommand(RemoteContainerCommands.REBUILD_CONTAINER, {
            execute: () => this.rebuildContainer(),
            isVisible: () => this.isRemoteSession()
        });
    }

    protected isRemoteSession(): boolean {
        return new URLSearchParams(window.location.search).has('localPort');
    }

    canHandle(uri: URI): MaybePromise<boolean> {
        if (uri.scheme !== DEV_CONTAINER_WORKSPACE_SCHEME) {
            return false;
        }
        // After disconnect (reload), sessionStorage still has the flag from
        // the remote session's init. Skip auto-reopen so the user gets their
        // local workspace. After restart (close+open), sessionStorage is
        // cleared, so auto-reopen works.
        const wasRemote = sessionStorage.getItem('devcontainer:wasRemote');
        if (wasRemote) {
            sessionStorage.removeItem('devcontainer:wasRemote');
            return false;
        }
        return true;
    }

    async openWorkspace(uri: URI, options?: WorkspaceInput | undefined): Promise<void> {
        const filePath = new URLSearchParams(uri.query).get(DEV_CONTAINER_PATH_QUERY);

        if (!filePath) {
            throw new Error('No devcontainer file specified for workspace');
        }

        const devcontainerFiles = await this.connectionProvider.getDevContainerFiles(uri.path.toString());
        const devcontainerFile = devcontainerFiles.find(file => file.path === filePath);

        if (!devcontainerFile) {
            throw new Error(`Devcontainer file at ${filePath} not found in workspace`);
        }

        return this.doOpenInContainer(devcontainerFile, uri.path.toString());
    }

    async getWorkspaceLabel(uri: URI): Promise<string | undefined> {
        const containerFilePath = new URLSearchParams(uri.query).get(DEV_CONTAINER_PATH_QUERY);
        if (!containerFilePath) {
            return;
        };
        const files = await this.connectionProvider.getDevContainerFiles(uri.path.toString());
        const devcontainerFile = files.find(file => file.path === containerFilePath);
        return `${uri.path.base} [Dev Container: ${devcontainerFile?.name}]`;
    }

    async openInContainer(): Promise<void> {
        const devcontainerFile = await this.getOrSelectDevcontainerFile();
        if (!devcontainerFile) {
            return;
        }
        this.doOpenInContainer(devcontainerFile);
    }

    async attachToContainer(): Promise<void> {
        const containers = await this.connectionProvider.listRunningContainers();
        if (containers.length === 0) {
            this.messageService.info(nls.localize('theia/remote/dev-container/noRunningContainers', 'No running containers found.'));
            return;
        }

        const selected = await this.quickInputService.pick(containers.map(container => ({
            type: 'item' as const,
            label: container.name || container.id.substring(0, 12),
            description: container.image,
            detail: container.status,
            container
        })), {
            title: nls.localize('theia/remote/dev-container/selectContainer', 'Select a running container to attach to')
        });

        if (!selected) {
            return;
        }

        this.containerOutputProvider.openChannel();

        const connectionResult = await this.connectionProvider.attachToContainer(selected.container.id);
        this.openRemote(connectionResult.port, false, connectionResult.workspacePath);
    }

    async rebuildContainer(): Promise<void> {
        this.containerOutputProvider.openChannel();
        const progress = await this.messageService.showProgress({
            text: nls.localize('theia/remote/dev-container/rebuilding', 'Rebuilding dev container...')
        });

        try {
            // When inside a remote container, read the stored context instead of
            // scanning the filesystem (the RPC goes to the local backend which
            // doesn't have the container's workspace path).
            const ctx = await this.storageService.getData<DevContainerContext | undefined>(ACTIVE_DEV_CONTAINER_CONTEXT);
            if (ctx) {
                progress.report({ message: 'Removing old container...' });
                try {
                    await this.connectionProvider.removeContainer(ctx.containerId);
                } catch (error) {
                    // Container may already be gone, ignore error
                }
                const lastContainerKey = `${LAST_USED_CONTAINER}:${ctx.devcontainerFilePath}`;
                await this.storageService.setData(lastContainerKey, undefined);
                progress.cancel();
                this.doOpenInContainer(
                    { path: ctx.devcontainerFilePath, name: ctx.devcontainerFileName },
                    ctx.hostWorkspacePath
                );
                return;
            }

            // Fallback: local workspace — scan for devcontainer files
            const devcontainerFile = await this.getOrSelectDevcontainerFile();
            if (!devcontainerFile) {
                return;
            }
            const lastContainerInfoKey = `${LAST_USED_CONTAINER}:${devcontainerFile.path}`;
            const lastContainerInfo = await this.storageService.getData<LastContainerInfo | undefined>(lastContainerInfoKey);
            if (lastContainerInfo) {
                progress.report({ message: 'Removing old container...' });
                try {
                    await this.connectionProvider.removeContainer(lastContainerInfo.id);
                } catch (error) {
                    // Container may already be gone, ignore error
                }
                await this.storageService.setData(lastContainerInfoKey, undefined);
            }
            progress.cancel();
            this.doOpenInContainer(devcontainerFile);
        } catch (e) {
            progress.cancel();
            this.messageService.error('Failed to rebuild container: ' + (e as Error).message);
        }
    }

    async doOpenInContainer(devcontainerFile: DevContainerFile, workspacePath?: string): Promise<void> {
        const lastContainerInfoKey = `${LAST_USED_CONTAINER}:${devcontainerFile.path}`;
        const lastContainerInfo = await this.storageService.getData<LastContainerInfo | undefined>(lastContainerInfoKey);

        this.containerOutputProvider.openChannel();

        const hostWorkspacePath = workspacePath ?? this.workspaceService.workspace?.resource.path.toString();

        const connectionResult = await this.connectionProvider.connectToContainer({
            nodeDownloadTemplate: this.remotePreferences['remote.nodeDownloadTemplate'],
            lastContainerInfo,
            devcontainerFile: devcontainerFile.path,
            workspacePath: hostWorkspacePath
        });

        this.storageService.setData<LastContainerInfo>(lastContainerInfoKey, {
            id: connectionResult.containerId,
            lastUsed: Date.now()
        });

        // Store full context so rebuild works from inside the container
        this.storageService.setData<DevContainerContext>(ACTIVE_DEV_CONTAINER_CONTEXT, {
            devcontainerFilePath: devcontainerFile.path,
            devcontainerFileName: devcontainerFile.name,
            hostWorkspacePath: hostWorkspacePath ?? '',
            containerId: connectionResult.containerId,
        });

        this.workspaceServer.setMostRecentlyUsedWorkspace(
            `${DEV_CONTAINER_WORKSPACE_SCHEME}:${hostWorkspacePath}?${DEV_CONTAINER_PATH_QUERY}=${devcontainerFile.path}`);

        this.openRemote(connectionResult.port, false, connectionResult.workspacePath);
    }

    async getOrSelectDevcontainerFile(): Promise<DevContainerFile | undefined> {
        const workspace = this.workspaceService.workspace;
        if (!workspace) {
            return;
        }
        const devcontainerFiles = await this.connectionProvider.getDevContainerFiles(workspace.resource.path.toString());

        if (devcontainerFiles.length === 1) {
            return devcontainerFiles[0];
        } else if (devcontainerFiles.length === 0) {
            // eslint-disable-next-line max-len
            this.messageService.error(nls.localize('theia/remote/dev-container/noDevcontainerFiles', 'No devcontainer.json files found in the workspace. Please ensure you have a .devcontainer directory with a devcontainer.json file.'));
            return undefined;
        }

        return (await this.quickInputService.pick(devcontainerFiles.map(file => ({
            type: 'item',
            label: file.name,
            description: file.path,
            file: file,
        })), {
            title: nls.localize('theia/remote/dev-container/selectDevcontainer', 'Select a devcontainer.json file')
        }))?.file;
    }

}
