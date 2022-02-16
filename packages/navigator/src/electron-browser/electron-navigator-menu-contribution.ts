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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core';
import { CommonCommands, KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import * as electron from '@theia/core/electron-shared/electron';
import * as electronRemote from '@theia/core/electron-shared/@electron/remote';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileStatNode } from '@theia/filesystem/lib/browser';
import { FileNavigatorWidget, FILE_NAVIGATOR_ID } from '../browser';
import { NavigatorContextMenu } from '../browser/navigator-contribution';
import { isWindows, isOSX } from '@theia/core/lib/common/os';

export const OPEN_CONTAINING_FOLDER = Command.toDefaultLocalizedCommand({
    id: 'revealFileInOS',
    category: CommonCommands.FILE_CATEGORY,
    label: isWindows ? 'Reveal in File Explorer' :
        isOSX ? 'Reveal in Finder' :
        /* linux */ 'Open Containing Folder'
});

@injectable()
export class ElectronNavigatorMenuContribution implements MenuContribution, CommandContribution, KeybindingContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(OPEN_CONTAINING_FOLDER, {
            isEnabled: () => this.getSelectedFileStatNodes().length > 0,
            isVisible: () => this.getSelectedFileStatNodes().length > 0,
            execute: () => {
                // workaround for https://github.com/electron/electron/issues/4349:
                // use electron.remote.shell to open the window in the foreground on Windows
                const shell = isWindows ? electronRemote.shell : electron.shell;
                this.getSelectedFileStatNodes().forEach(node => {
                    shell.showItemInFolder(node.uri['codeUri'].fsPath);
                });
            }
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(NavigatorContextMenu.NAVIGATION, {
            commandId: OPEN_CONTAINING_FOLDER.id,
            label: OPEN_CONTAINING_FOLDER.label
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
