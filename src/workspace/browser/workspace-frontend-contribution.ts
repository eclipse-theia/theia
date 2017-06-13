/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Command } from "../../application/common";
import { FrontendApplicationContribution, FrontendApplication, OpenerService, open } from "../../application/browser";
import { FileSystem } from '../../filesystem/common';
import { FileMenus, FileDialogFactory, FileStatNode } from "../../filesystem/browser";
// FIXME move FileUri to common
import { FileUri } from "../../application/node/file-uri";
import { WorkspaceService } from "./workspace-service";

export namespace WorkspaceCommands {
    export const OPEN: Command = {
        id: 'workspace:open',
        label: 'Open...'
    }
}

@injectable()
export class WorkspaceFrontendContribution implements FrontendApplicationContribution {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileDialogFactory) protected readonly fileDialogFactory: FileDialogFactory,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService
    ) { }

    onInitialize({ commands, menus }: FrontendApplication): void {
        commands.registerCommand(WorkspaceCommands.OPEN, {
            isEnabled: () => true,
            execute: () => this.showFileDialog()
        });
        menus.registerMenuAction(FileMenus.OPEN_GROUP, {
            commandId: WorkspaceCommands.OPEN.id
        });
    }

    protected showFileDialog(): void {
        const fileDialog = this.fileDialogFactory({
            title: WorkspaceCommands.OPEN.label!
        });
        fileDialog.model.currentLocation = FileUri.create('/');
        fileDialog.open().then(node =>
            this.openFile(node)
        );
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