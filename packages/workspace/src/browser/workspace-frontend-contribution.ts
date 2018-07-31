/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";
import { open, OpenerService, CommonMenus, StorageService, LabelProvider, ConfirmDialog } from '@theia/core/lib/browser';
import { DirNode, FileDialogFactory, FileStatNode } from '@theia/filesystem/lib/browser';
import { FileSystem } from '@theia/filesystem/lib/common';
import { WorkspaceService } from './workspace-service';
import { WorkspaceCommands } from "./workspace-commands";
import { QuickOpenWorkspace } from "./quick-open-workspace";

@injectable()
export class WorkspaceFrontendContribution implements CommandContribution, MenuContribution {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileDialogFactory) protected readonly fileDialogFactory: FileDialogFactory,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(StorageService) protected readonly workspaceStorage: StorageService,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(QuickOpenWorkspace) protected readonly quickOpenWorkspace: QuickOpenWorkspace,
    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(WorkspaceCommands.OPEN, {
            isEnabled: () => true,
            execute: () => this.showFileDialog()
        });
        commands.registerCommand(WorkspaceCommands.CLOSE, {
            isEnabled: () => this.workspaceService.opened,
            execute: () => this.closeWorkspace()
        });
        commands.registerCommand(WorkspaceCommands.OPEN_RECENT_WORKSPACE, {
            isEnabled: () => this.workspaceService.hasHistory,
            execute: () => this.quickOpenWorkspace.select()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: WorkspaceCommands.OPEN.id
        });
        menus.registerMenuAction(CommonMenus.FILE_CLOSE, {
            commandId: WorkspaceCommands.CLOSE.id
        });
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: WorkspaceCommands.OPEN_RECENT_WORKSPACE.id
        });
    }

    protected showFileDialog(): void {
        this.workspaceService.root.then(async resolvedRoot => {
            const root = resolvedRoot || await this.fileSystem.getCurrentUserHome();
            if (root) {
                const parentUri = new URI(root.uri).parent;
                const parentStat = await this.fileSystem.getFileStat(parentUri.toString());
                if (parentStat) {
                    const name = this.labelProvider.getName(parentUri);
                    const label = await this.labelProvider.getIcon(root);
                    const rootNode = DirNode.createRoot(parentStat, name, label);
                    const dialog = this.fileDialogFactory({ title: WorkspaceCommands.OPEN.label! });
                    dialog.model.navigateTo(rootNode);
                    const node = await dialog.open();
                    this.openFile(node);
                }
            }
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

    protected async closeWorkspace(): Promise<void> {
        const dialog = new ConfirmDialog({
            title: 'Close Workspace',
            msg: 'Do you really want to close the workspace?'
        });
        if (await dialog.open()) {
            this.workspaceService.close();
        }
    }

}
