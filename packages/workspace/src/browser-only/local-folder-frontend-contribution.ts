// *****************************************************************************
// Copyright (C) 2026 Robert Jandow
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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, ILogger, MessageService, URI, nls } from '@theia/core/lib/common';
import { CommonCommands, CommonMenus, FrontendApplicationContribution, QuickInputService, QuickPickItem } from '@theia/core/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { LocalDirectoryMountService } from '@theia/filesystem/lib/browser-only/file-system-access/local-directory-mount-service';
import { WorkspaceService } from '../browser/workspace-service.js';

export namespace LocalFolderCommands {
    export const OPEN_LOCAL_FOLDER = Command.toDefaultLocalizedCommand({
        id: 'workspace:openLocalFolder',
        category: CommonCommands.FILE_CATEGORY,
        label: 'Open Local Folder...'
    });
    export const ADD_LOCAL_FOLDER = Command.toLocalizedCommand({
        id: 'workspace:addLocalFolder',
        category: CommonCommands.FILE_CATEGORY,
        label: 'Add Local Folder to Workspace...'
    }, 'theia/workspace/addLocalFolder', CommonCommands.FILE_CATEGORY_KEY);
    export const FORGET_LOCAL_FOLDER = Command.toLocalizedCommand({
        id: 'workspace:forgetLocalFolder',
        category: CommonCommands.FILE_CATEGORY,
        label: 'Forget Local Folder...'
    }, 'theia/workspace/forgetLocalFolder', CommonCommands.FILE_CATEGORY_KEY);
}

@injectable()
export class LocalFolderFrontendContribution implements CommandContribution, MenuContribution, FrontendApplicationContribution {

    @inject(LocalDirectoryMountService)
    protected readonly mountService: LocalDirectoryMountService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(ILogger) @named('workspace:LocalFolderFrontendContribution')
    protected readonly logger: ILogger;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    /** The workspace that could not be opened at startup, because access to its mount is missing. */
    protected workspaceToReopen: URI | undefined;

    registerCommands(commands: CommandRegistry): void {
        const isSupported = () => this.mountService.isSupported();
        commands.registerCommand(LocalFolderCommands.OPEN_LOCAL_FOLDER, {
            isEnabled: isSupported,
            isVisible: isSupported,
            execute: () => this.openLocalFolder()
        });
        commands.registerCommand(LocalFolderCommands.ADD_LOCAL_FOLDER, {
            isEnabled: isSupported,
            isVisible: isSupported,
            execute: () => this.addLocalFolder()
        });
        const canForget = () => this.mountService.isSupported() && this.mountService.getMounts().length > 0;
        commands.registerCommand(LocalFolderCommands.FORGET_LOCAL_FOLDER, {
            isEnabled: canForget,
            isVisible: canForget,
            execute: () => this.forgetLocalFolder()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: LocalFolderCommands.OPEN_LOCAL_FOLDER.id,
            order: 'a03'
        });
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: LocalFolderCommands.ADD_LOCAL_FOLDER.id,
            order: 'a04'
        });
    }

    onStart(): void {
        // Must not block the application start.
        this.promptForMissingAccess().catch(error => this.logger.error('Failed to check the access to local folders', error));
    }

    protected async openLocalFolder(): Promise<void> {
        // The picker requires a user gesture, so nothing slow may be awaited before it.
        const uri = await this.mountService.pickAndMount();
        if (uri) {
            this.workspaceService.open(uri);
        }
    }

    protected async addLocalFolder(): Promise<void> {
        const uri = await this.mountService.pickAndMount();
        if (!uri) {
            return;
        }
        if (this.workspaceService.opened) {
            await this.workspaceService.addRoot(uri);
        } else {
            this.workspaceService.open(uri);
        }
    }

    protected async forgetLocalFolder(): Promise<void> {
        const items: QuickPickItem[] = this.mountService.getMounts().map(mount => ({ label: mount.name }));
        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: nls.localize('theia/workspace/forgetLocalFolderPlaceholder', 'Select the local folder to forget')
        });
        if (!selected) {
            return;
        }
        const name = selected.label;
        const roots = this.workspaceService.tryGetRoots().map(root => root.resource);
        const workspaceUri = this.workspaceService.workspace?.resource;
        const rootsInMount = roots.filter(root => this.mountService.getMountPath(root)?.name === name);
        const workspaceInMount = workspaceUri !== undefined && this.mountService.getMountPath(workspaceUri)?.name === name;
        if (rootsInMount.length > 0) {
            // Unmounting a folder that backs the whole workspace would leave it broken. A root of a
            // multi-root workspace file located elsewhere can be dropped safely.
            if (workspaceInMount || rootsInMount.length === roots.length || !this.workspaceService.saved) {
                this.messageService.warn(nls.localize('theia/workspace/localFolderInUse',
                    "The local folder '{0}' is part of the current workspace. Close or change the workspace before forgetting it.", name));
                return;
            }
            await this.workspaceService.removeRoots(rootsInMount);
        }
        await this.mountService.unmount(name);
        await this.removeRecentWorkspaces(name);
    }

    protected async removeRecentWorkspaces(mountName: string): Promise<void> {
        // Mount names are derived from the folder name, so a stale entry would open the next folder of that name.
        // Sequential because every removal rewrites the whole list.
        for (const recent of await this.workspaceService.recentWorkspaces()) {
            if (this.mountService.getMountPath(new URI(recent))?.name === mountName) {
                await this.workspaceService.removeRecentWorkspace(recent);
            }
        }
    }

    protected async promptForMissingAccess(): Promise<void> {
        if (!this.mountService.isSupported()) {
            return;
        }
        await this.mountService.ready;
        const roots = await this.workspaceService.roots;
        const uris = roots.map(root => root.resource);
        const opened = this.workspaceService.workspace?.resource;
        if (opened) {
            uris.push(opened);
        }
        // Without access only the mount root can be read, so a workspace file inside the mount never got opened.
        const requested = this.workspaceService.requestedWorkspace;
        if (requested) {
            uris.push(requested);
        }
        const pending = new Set<string>();
        for (const uri of uris) {
            const name = this.mountService.getMountPath(uri)?.name;
            const mount = name !== undefined ? this.mountService.getMount(name) : undefined;
            if (mount && mount.permission !== 'granted') {
                pending.add(mount.name);
            }
        }
        const requestedMount = requested && this.mountService.getMountPath(requested)?.name;
        if (requestedMount !== undefined && pending.has(requestedMount) && requested?.toString() !== opened?.toString()) {
            this.workspaceToReopen = requested;
        }
        // One message per mount: every request needs its own user gesture.
        for (const name of pending) {
            this.promptForAccess(name, pending);
        }
    }

    protected promptForAccess(name: string, pending: Set<string>, denied = false): void {
        const grantLabel = denied ? nls.localizeByDefault('Try Again') : nls.localize('theia/workspace/grantAccess', 'Grant Access');
        const message = denied
            ? this.messageService.warn(nls.localize('theia/workspace/localFolderAccessDenied',
                "Access to the local folder '{0}' was not granted, so its files can't be shown.", name), grantLabel)
            : this.messageService.info(nls.localize('theia/workspace/localFolderAccess',
                "Access to the local folder '{0}' needs to be granted again.", name), grantLabel);
        message.then(async action => {
            if (action !== grantLabel) {
                return;
            }
            if (await this.mountService.requestAccess(name)) {
                pending.delete(name);
                // Reload once the last missing mount is granted so that the workspace is read with access.
                if (pending.size === 0) {
                    this.reloadWorkspace();
                }
            } else {
                // Otherwise the user would be left with an empty folder and no way to ask again short of reloading.
                this.promptForAccess(name, pending, true);
            }
        }).catch(error => this.logger.error(`Failed to request access to the local folder '${name}'`, error));
    }

    protected reloadWorkspace(): void {
        if (this.workspaceToReopen) {
            // The failed restore cleared the URL fragment and the most recently used workspace, so a reload would open nothing.
            this.workspaceService.open(this.workspaceToReopen, { preserveWindow: true });
        } else {
            this.windowService.reload();
        }
    }
}
