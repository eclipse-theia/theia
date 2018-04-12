/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core/lib/common';
import { open, OpenerService, CommonMenus, StorageService, LabelProvider, ConfirmDialog } from '@theia/core/lib/browser';
import { DirNode, FileDialogFactory, FileStatNode, SaveFileDialogFactory, FileDialogProps } from '@theia/filesystem/lib/browser';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import { WorkspaceService } from './workspace-service';
import { WorkspaceCommands } from "./workspace-commands";

@injectable()
export class WorkspaceFrontendContribution implements CommandContribution, MenuContribution {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileDialogFactory) protected readonly fileDialogFactory: FileDialogFactory,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(StorageService) protected readonly workspaceStorage: StorageService,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(SaveFileDialogFactory) protected readonly saveFileDialogFactory: SaveFileDialogFactory,
    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(WorkspaceCommands.OPEN_FOLDER, {
            isEnabled: () => true,
            execute: () => this.workspaceService.activeRoot.then(async activeRoot => {
                const node = await this.showFileDialog(activeRoot, WorkspaceCommands.OPEN_FOLDER.label!);
                this.openFile(node);
            })
        });
        commands.registerCommand(WorkspaceCommands.CLOSE, {
            isEnabled: () => this.workspaceService.opened,
            execute: () => this.closeWorkspace()
        });
        commands.registerCommand(WorkspaceCommands.ADD_FOLDER, {
            isEnabled: () => this.workspaceService.opened,
            execute: async () => {
                const node = await this.showFileDialog(undefined, WorkspaceCommands.ADD_FOLDER.label!);
                this.addFolderToWorkspace(node);
            }
        });
        commands.registerCommand(WorkspaceCommands.SAVE_WORKSPACE_AS, {
            isEnabled: () => this.workspaceService.opened,
            execute: () => this.saveWorkspaceAs()
        });
        commands.registerCommand(WorkspaceCommands.OPEN_WORKSPACE, {
            execute: () => this.loadFromWorkspaceConfig()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: WorkspaceCommands.OPEN_FOLDER.id
        });
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: WorkspaceCommands.OPEN_WORKSPACE.id
        });
        menus.registerMenuAction(CommonMenus.FILE_CLOSE, {
            commandId: WorkspaceCommands.CLOSE.id
        });
        menus.registerMenuAction(CommonMenus.FILE_SAVE, {
            commandId: WorkspaceCommands.SAVE_WORKSPACE_AS.id
        });
    }

    protected async showFileDialog(folder: FileStat | undefined, title: string): Promise<FileStatNode | undefined> {
        const folderToOpen = folder || await this.fileSystem.getCurrentUserHome();
        if (folderToOpen) {
            const rootUri = new URI(folderToOpen.uri).parent;
            const rootStat = await this.fileSystem.getFileStat(rootUri.toString());
            const name = this.labelProvider.getName(rootUri);
            const label = await this.labelProvider.getIcon(folderToOpen);
            if (rootStat) {
                const rootNode = DirNode.createRoot(rootStat, name, label);
                const dialog = this.fileDialogFactory(new FileDialogProps(title));
                dialog.model.navigateTo(rootNode);
                const node = await dialog.open();
                return node;
            }
        }
    }

    protected async saveWorkspaceAs(): Promise<void> {
        const folderToOpen = await this.fileSystem.getCurrentUserHome();
        if (folderToOpen) {
            const rootUri = new URI(folderToOpen.uri).parent;
            const rootStat = await this.fileSystem.getFileStat(rootUri.toString());
            const name = this.labelProvider.getName(rootUri);
            const label = await this.labelProvider.getIcon(folderToOpen);
            if (rootStat) {
                const rootNode = DirNode.createRoot(rootStat, name, label);
                const dialog = this.saveFileDialogFactory(
                    new FileDialogProps(WorkspaceCommands.SAVE_WORKSPACE_AS.label!, true, () => '', true, () => '', 'Save')
                );
                dialog.model.navigateTo(rootNode);
                const node = await dialog.open();
                if (node) {
                    await this.workspaceService.saveWorkspaceConfigAs(node.fileStat);
                }
            }
        }
    }

    protected async loadFromWorkspaceConfig(): Promise<void> {
        const folderToOpen = await this.fileSystem.getCurrentUserHome();
        if (folderToOpen) {
            const rootUri = new URI(folderToOpen.uri).parent;
            const rootStat = await this.fileSystem.getFileStat(rootUri.toString());
            const name = this.labelProvider.getName(rootUri);
            const label = await this.labelProvider.getIcon(folderToOpen);
            if (rootStat) {
                const rootNode = DirNode.createRoot(rootStat, name, label);
                const dialog = this.fileDialogFactory(new FileDialogProps(
                    WorkspaceCommands.OPEN_WORKSPACE.label!,
                    false,
                    () => 'Please select a config file to open the workspace.',
                    true
                ));
                dialog.model.navigateTo(rootNode);
                const node = await dialog.open();
                if (node) {
                    await this.workspaceService.loadWorkspaceFromConfig(node.fileStat);
                }
            }
        }
    }

    protected openFile(node: Readonly<FileStatNode> | undefined): void {
        if (!node) {
            return;
        }
        if (node.fileStat.isDirectory) {
            this.workspaceService.open(node.uri);
        } else {
            open(this.openerService, node.uri);
        }
    }

    protected async closeWorkspace(): Promise<void> {
        const dialog = new ConfirmDialog({
            title: 'Close Workspace',
            msg: 'Do you really want to close the workspace?'
        });
        if (await dialog.open()) {
            this.workspaceService.close();
        }
    }

    protected addFolderToWorkspace(node: Readonly<FileStatNode> | undefined): void {
        if (!node) {
            return;
        }
        if (node.fileStat.isDirectory) {
            this.workspaceService.addFolder(node.uri);
        } else {
            open(this.openerService, node.uri);
        }
    }
}
