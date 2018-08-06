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
import { Command, MenuModelRegistry, CommandRegistry } from '@theia/core';
import { UserPreferenceProvider } from './user-preference-provider';
import {
    CommonMenus,
    PreferenceScope,
    PreferenceProvider,
    AbstractViewContribution
} from '@theia/core/lib/browser';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { FileSystem } from '@theia/filesystem/lib/common';
import { UserStorageService } from '@theia/userstorage/lib/browser';
import { PreferencesContainer } from './preferences-tree-widget';

export const PREFERENCES_COMMAND: Command = {
    id: 'preferences:open',
    label: 'Open Preferences'
};

export const PREFERENCES_CONTAINER_WIDGET_ID = 'preferences_container_widget';
export const PREFERENCES_TREE_WIDGET_ID = 'preferences_tree_widget';

@injectable()
export class PreferencesContribution extends AbstractViewContribution<PreferencesContainer> {

    @inject(UserStorageService) protected readonly userStorageService: UserStorageService;
    @inject(PreferenceProvider) @named(PreferenceScope.User) protected readonly userPreferenceProvider: UserPreferenceProvider;
    @inject(PreferenceProvider) @named(PreferenceScope.Workspace) protected readonly workspacePreferenceProvider: WorkspacePreferenceProvider;
    @inject(FileSystem) protected readonly filesystem: FileSystem;

    constructor() {
        super ({
            widgetId: PREFERENCES_CONTAINER_WIDGET_ID,
            widgetName: 'Preferences',
            defaultWidgetOptions: {area: 'main'}
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(PREFERENCES_COMMAND, {
            isEnabled: () => true,
            execute: () => this.openPreferences()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: PREFERENCES_COMMAND.id
        });
    }

    protected async openPreferences(): Promise<void> {
        const userUri = this.userPreferenceProvider.getUri();
        const content = await this.userStorageService.readContents(userUri);
        if (content === '') {
            await this.userStorageService.saveContents(userUri, this.getPreferenceTemplateForScope('user'));
        }

        const wsUri = await this.workspacePreferenceProvider.getUri();
        if (!wsUri) {
            return;
        }
        if (!(await this.filesystem.exists(wsUri.toString()))) {
            await this.filesystem.createFile(wsUri.toString(), { content: this.getPreferenceTemplateForScope('workspace') });
        }

        super.openView({activate: true});
    }

    private getPreferenceTemplateForScope(scope: string): string {
        return `/*
Preference file for ${scope} scope

Please refer to the documentation online (https://github.com/theia-ide/theia/blob/master/packages/preferences/README.md) to learn how preferences work in Theia
*/`;
    }
}
