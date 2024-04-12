// *****************************************************************************
// Copyright (C) 2021 EclipseSource and others.
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

import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, SelectionService, URI } from '@theia/core';
import { CommonCommands, KeybindingContribution, KeybindingRegistry, OpenWithService } from '@theia/core/lib/browser';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { nls } from '@theia/core/lib/common';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { isOSX, isWindows } from '@theia/core/lib/common/os';
import { UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import '@theia/core/lib/electron-common/electron-api';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileStatNode } from '@theia/filesystem/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FILE_NAVIGATOR_ID, FileNavigatorWidget } from '../browser';
import { NavigatorContextMenu, SHELL_TABBAR_CONTEXT_REVEAL } from '../browser/navigator-contribution';

export const OPEN_CONTAINING_FOLDER = Command.toDefaultLocalizedCommand({
    id: 'revealFileInOS',
    category: CommonCommands.FILE_CATEGORY,
    label: isWindows ? 'Reveal in File Explorer' :
        isOSX ? 'Reveal in Finder' :
        /* linux */ 'Open Containing Folder'
});

export const OPEN_WITH_SYSTEM_APP = Command.toDefaultLocalizedCommand({
    id: 'openWithSystemApp',
    category: CommonCommands.FILE_CATEGORY,
    label: 'Open With System Editor'
});

@injectable()
export class ElectronNavigatorMenuContribution implements MenuContribution, CommandContribution, KeybindingContribution {

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(OpenWithService)
    protected readonly openWithService: OpenWithService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(OPEN_CONTAINING_FOLDER, UriAwareCommandHandler.MonoSelect(this.selectionService, {
            execute: async uri => {
                window.electronTheiaCore.showItemInFolder(FileUri.fsPath(uri));
            },
            isEnabled: uri => !!this.workspaceService.getWorkspaceRootUri(uri),
            isVisible: uri => !!this.workspaceService.getWorkspaceRootUri(uri),
        }));
        commands.registerCommand(OPEN_WITH_SYSTEM_APP, UriAwareCommandHandler.MonoSelect(this.selectionService, {
            execute: async uri => {
                this.openWithSystemApplication(uri);
            }
        }));
        this.openWithService.registerHandler({
            id: 'system-editor',
            label: nls.localize('theia/navigator/systemEditor', 'System Editor'),
            providerName: nls.localizeByDefault('Built-in'),
            // Low priority to avoid conflicts with other open handlers.
            canHandle: uri => (uri.scheme === 'file') ? 10 : 0,
            open: uri => {
                this.openWithSystemApplication(uri);
                return {};
            }
        });
    }

    protected openWithSystemApplication(uri: URI): void {
        window.electronTheiaCore.openWithSystemApp(FileUri.fsPath(uri));
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(NavigatorContextMenu.NAVIGATION, {
            commandId: OPEN_CONTAINING_FOLDER.id,
            label: OPEN_CONTAINING_FOLDER.label
        });
        menus.registerMenuAction(SHELL_TABBAR_CONTEXT_REVEAL, {
            commandId: OPEN_CONTAINING_FOLDER.id,
            label: OPEN_CONTAINING_FOLDER.label,
            order: '4'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: OPEN_CONTAINING_FOLDER.id,
            keybinding: 'ctrlcmd+alt+p',
            when: 'filesExplorerFocus'
        });
    }

    protected getSelectedFileStatNodes(): FileStatNode[] {
        const navigator = this.tryGetNavigatorWidget();
        return navigator ? navigator.model.selectedNodes.filter(FileStatNode.is) : [];
    }

    tryGetNavigatorWidget(): FileNavigatorWidget | undefined {
        return this.widgetManager.tryGetWidget(FILE_NAVIGATOR_ID);
    }

}
