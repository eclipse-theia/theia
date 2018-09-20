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

import { injectable, inject } from 'inversify';
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core/lib/common';
import {
    open, OpenerService, CommonMenus,
    StorageService, LabelProvider, ConfirmDialog,
    KeybindingRegistry, KeybindingContribution, AbstractViewContribution, CommonCommands
} from '@theia/core/lib/browser';
import { FileStatNode, FileDialogService, OpenFileDialogProps } from '@theia/filesystem/lib/browser';
import { FileSystem } from '@theia/filesystem/lib/common';
import { WorkspaceService } from './workspace-service';
import { WorkspaceCommands } from './workspace-commands';
import { QuickOpenWorkspace } from './quick-open-workspace';
import { StartingPageWidget } from './starting-page-widget';

@injectable()
export class WorkspaceFrontendContribution extends AbstractViewContribution<StartingPageWidget>
    implements CommandContribution, KeybindingContribution, MenuContribution {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(StorageService) protected readonly workspaceStorage: StorageService,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(QuickOpenWorkspace) protected readonly quickOpenWorkspace: QuickOpenWorkspace,
        @inject(FileDialogService) protected readonly fileDialogService: FileDialogService
    ) {
        super({
            widgetId: StartingPageWidget.ID,
            widgetName: 'Starting Page Widget',
            defaultWidgetOptions: {
                area: 'main'
            },
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(WorkspaceCommands.OPEN, {
            isEnabled: () => true,
            execute: () => this.showFileDialog({
                title: WorkspaceCommands.OPEN.label!,
                canSelectFolders: true,
                canSelectFiles: true
            })
        });
        commands.registerCommand(WorkspaceCommands.OPEN_WORKSPACE, {
            isEnabled: () => true,
            execute: () => this.showFileDialog({
                title: WorkspaceCommands.OPEN_WORKSPACE.label!,
                canSelectFolders: true,
                canSelectFiles: false
            })
        });
        commands.registerCommand(WorkspaceCommands.CLOSE, {
            isEnabled: () => this.workspaceService.opened,
            execute: () => this.closeWorkspace()
        });
        commands.registerCommand(WorkspaceCommands.OPEN_RECENT_WORKSPACE, {
            isEnabled: () => this.workspaceService.hasHistory,
            execute: () => this.quickOpenWorkspace.select()
        });
        commands.registerCommand(CommonCommands.VIEW_STARTING_PAGE, {
            isEnabled: () => true,
            execute: () => this.openView(),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: WorkspaceCommands.OPEN.id,
            order: 'a00'
        });
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: WorkspaceCommands.OPEN_WORKSPACE.id,
            order: 'a10'
        });
        menus.registerMenuAction(CommonMenus.FILE_CLOSE, {
            commandId: WorkspaceCommands.CLOSE.id
        });
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: WorkspaceCommands.OPEN_RECENT_WORKSPACE.id,
            order: 'a20'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: WorkspaceCommands.OPEN.id,
            keybinding: 'ctrlcmd+alt+o',
        });
        keybindings.registerKeybinding({
            command: WorkspaceCommands.OPEN_WORKSPACE.id,
            keybinding: 'ctrlcmd+alt+w',
        });
        keybindings.registerKeybinding({
            command: WorkspaceCommands.OPEN_RECENT_WORKSPACE.id,
            keybinding: 'ctrlcmd+alt+r',
        });
    }

    async openView(): Promise<StartingPageWidget> {
        const widget = await super.openView();
        return widget;
    }

    protected showFileDialog(props: OpenFileDialogProps): void {
        this.workspaceService.roots.then(async roots => {
            const node = await this.fileDialogService.showOpenDialog(props, roots[0]);
            this.openFile(node);
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
            title: WorkspaceCommands.CLOSE.label!,
            msg: 'Do you really want to close the workspace?'
        });
        if (await dialog.open()) {
            this.workspaceService.close();
        }
    }

}
