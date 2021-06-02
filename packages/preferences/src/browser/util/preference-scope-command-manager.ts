/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { PreferenceScope, LabelProvider } from '@theia/core/lib/browser';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { CommandRegistry, MenuModelRegistry, Command } from '@theia/core/lib/common';
import { Preference } from './preference-types';

export const FOLDER_SCOPE_MENU_PATH = ['preferences:scope.menu'];

@injectable()
export class PreferenceScopeCommandManager {
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(MenuModelRegistry) protected readonly menuModelRegistry: MenuModelRegistry;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    protected foldersAsCommands: Command[] = [];

    createFolderWorkspacesMenu(
        folderWorkspaces: FileStat[],
        currentFolderURI: string,
    ): void {
        this.foldersAsCommands.forEach(folderCommand => {
            this.menuModelRegistry.unregisterMenuAction(folderCommand, FOLDER_SCOPE_MENU_PATH);
            this.commandRegistry.unregisterCommand(folderCommand);
        });
        this.foldersAsCommands.length = 0;

        folderWorkspaces.forEach(folderWorkspace => {
            const folderLabel = this.labelProvider.getName(folderWorkspace.resource);

            const iconClass = currentFolderURI === folderWorkspace.resource.toString() ? 'fa fa-check' : '';
            const newFolderAsCommand = {
                id: `preferenceScopeCommand:${folderWorkspace.resource.toString()}`,
                label: folderLabel,
                iconClass: iconClass
            };

            this.foldersAsCommands.push(newFolderAsCommand);

            this.commandRegistry.registerCommand(newFolderAsCommand, {
                isVisible: (callback, check) => check === 'from-tabbar',
                isEnabled: (callback, check) => check === 'from-tabbar',
                execute: (callback: (scopeDetails: Preference.SelectedScopeDetails) => void) => {
                    callback({ scope: PreferenceScope.Folder.toString(), uri: folderWorkspace.resource.toString(), activeScopeIsFolder: 'true' });
                }
            });

            this.menuModelRegistry.registerMenuAction(FOLDER_SCOPE_MENU_PATH, {
                commandId: newFolderAsCommand.id,
                label: newFolderAsCommand.label
            });
        });
    }
}
