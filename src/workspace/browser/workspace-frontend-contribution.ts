/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Command } from "../../application/common";
import { FrontendApplicationContribution, FrontendApplication } from "../../application/browser";
import { FileSystem } from "../../filesystem/common";
import { FileMenus } from "../../filesystem/browser/filesystem-commands";
import { FileDialogFactory } from "./file-dialog";
import { DirNode } from '../../navigator/browser/file-tree';
// FIXME move FileUri to common
import { FileUri } from "../../application/node/file-uri";


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
        @inject(FileDialogFactory) protected readonly fileDialogFactory: FileDialogFactory
    ) { }

    onInitialize({ commands, menus }: FrontendApplication): void {
        commands.registerCommand(WorkspaceCommands.OPEN, {
            isEnabled: () => true,
            execute: () => {
                this.fileSystem.getFileStat(FileUri.create('/').toString()).then(fileStat => {
                    const fileDialog = this.fileDialogFactory(WorkspaceCommands.OPEN.label!);
                    fileDialog.model.navigateTo(DirNode.createRoot(fileStat));
                    fileDialog.open();
                });
            }
        });
        menus.registerMenuAction(FileMenus.OPEN_GROUP, {
            commandId: WorkspaceCommands.OPEN.id
        });
    }

}