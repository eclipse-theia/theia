/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { injectable, inject, named } from 'inversify';
import { MenuModelRegistry, CommandRegistry } from '@theia/core';
import {
    CommonMenus,
    PreferenceScope,
    PreferenceProvider,
    AbstractViewContribution,
    CommonCommands,
    KeybindingRegistry
} from '@theia/core/lib/browser';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { FileSystem } from '@theia/filesystem/lib/common';
import { UserStorageService } from '@theia/userstorage/lib/browser';
import { PreferencesContainer } from './preferences-tree-widget';
import { EditorManager } from '@theia/editor/lib/browser';

@injectable()
export class PreferencesContribution extends AbstractViewContribution<PreferencesContainer> {

    @inject(UserStorageService) protected readonly userStorageService: UserStorageService;
    @inject(PreferenceProvider) @named(PreferenceScope.Workspace) protected readonly workspacePreferenceProvider: WorkspacePreferenceProvider;
    @inject(FileSystem) protected readonly filesystem: FileSystem;
    @inject(EditorManager) protected readonly editorManager: EditorManager;

    constructor() {
        super({
            widgetId: PreferencesContainer.ID,
            widgetName: 'Preferences',
            defaultWidgetOptions: { area: 'main' }
        });
    }

    async registerCommands(commands: CommandRegistry): Promise<void> {
        commands.registerCommand(CommonCommands.OPEN_PREFERENCES, {
            isEnabled: () => true,
            execute: (preferenceScope = PreferenceScope.User) => this.openPreferences(preferenceScope)
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_SETTINGS_SUBMENU_OPEN, {
            commandId: CommonCommands.OPEN_PREFERENCES.id,
            order: 'a10'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: CommonCommands.OPEN_PREFERENCES.id,
            keybinding: 'ctrl+,'
        });
    }

    protected async openPreferences(preferenceScope: PreferenceScope): Promise<void> {
        const wsUri = this.workspacePreferenceProvider.getConfigUri();
        if (wsUri && !await this.filesystem.exists(wsUri.toString())) {
            await this.filesystem.createFile(wsUri.toString());
        }

        const widget = await this.widget;
        widget.preferenceScope = preferenceScope;
        super.openView({ activate: true });
        widget.activatePreferenceEditor(preferenceScope);
    }

}
