/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";
import URI from "@theia/core/lib/common/uri";
import { open, OpenerService } from '@theia/core/lib/browser';
import { DirNode, FileDialogFactory, FileStatNode } from '@theia/filesystem/lib/browser';
import { FileSystem } from '@theia/filesystem/lib/common';
import { WorkspaceService } from './workspace-service';
import { FileMenus } from './workspace-commands';
import { StorageService } from '@theia/core/lib/browser/storage-service';

export namespace WorkspaceCommands {
    export const OPEN: Command = {
        id: 'workspace:open',
        label: 'Open...'
    }
}

@injectable()
export class WorkspaceFrontendContribution implements CommandContribution, MenuContribution {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileDialogFactory) protected readonly fileDialogFactory: FileDialogFactory,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(StorageService) protected readonly workspaceStorage: StorageService
    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(WorkspaceCommands.OPEN, {
            isEnabled: () => true,
            execute: () => this.showFileDialog()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(FileMenus.OPEN_GROUP, {
            commandId: WorkspaceCommands.OPEN.id
        });
    }

    protected showFileDialog(): void {
        this.workspaceService.root.then(root => {
            const rootUri = new URI(root.uri).parent;
            this.fileSystem.getFileStat(rootUri.toString()).then(startWith => {
                const node = DirNode.createRoot(startWith);

                const fileDialog = this.fileDialogFactory({
                    title: WorkspaceCommands.OPEN.label!
                });
                fileDialog.model.navigateTo(node);
                fileDialog.open().then(node =>
                    this.openFile(node)
                );
            });
        });
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

}