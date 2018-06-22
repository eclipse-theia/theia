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

import { injectable, inject, named } from "inversify";
import { CommandContribution, MenuContribution, Command, MenuModelRegistry, CommandRegistry } from "@theia/core";
import { UserPreferenceProvider } from "./user-preference-provider";
import { open, OpenerService, CommonMenus, PreferenceScope, PreferenceProvider } from "@theia/core/lib/browser";
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { FileSystem } from "@theia/filesystem/lib/common";
import { UserStorageService } from "@theia/userstorage/lib/browser";

export namespace PreferenceCommands {
    export const OPEN_USER_PREFERENCES: Command = {
        id: 'preferences:open_user',
        label: 'Open User Preferences'
    };
    export const OPEN_WORKSPACE_PREFERENCES: Command = {
        id: 'preferences:open_workspace',
        label: 'Open Workspace Preferences'
    };
}

@injectable()
export class PreferenceFrontendContribution implements CommandContribution, MenuContribution {

    @inject(UserStorageService) protected readonly userStorageService: UserStorageService;
    @inject(PreferenceProvider) @named(PreferenceScope.User) protected readonly userPreferenceProvider: UserPreferenceProvider;
    @inject(PreferenceProvider) @named(PreferenceScope.Workspace) protected readonly workspacePreferenceProvider: WorkspacePreferenceProvider;
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(FileSystem) protected readonly filesystem: FileSystem;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(PreferenceCommands.OPEN_USER_PREFERENCES, {
            isEnabled: () => true,
            execute: () => this.openUserPreferences()
        });

        commands.registerCommand(PreferenceCommands.OPEN_WORKSPACE_PREFERENCES, {
            isEnabled: () => true,
            execute: () => this.openWorkspacePreferences()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: PreferenceCommands.OPEN_USER_PREFERENCES.id
        });
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: PreferenceCommands.OPEN_WORKSPACE_PREFERENCES.id
        });
    }

    protected async openUserPreferences(): Promise<void> {
        const userUri = this.userPreferenceProvider.getUri();
        const content = await this.userStorageService.readContents(userUri);
        if (content === "") {
            await this.userStorageService.saveContents(userUri, this.getPreferenceTemplateForScope('user'));
        }

        open(this.openerService, userUri);
    }

    protected async openWorkspacePreferences(): Promise<void> {
        const wsUri = await this.workspacePreferenceProvider.getUri();
        if (!wsUri) {
            return;
        }
        if (!(await this.filesystem.exists(wsUri.toString()))) {
            await this.filesystem.createFile(wsUri.toString(), { content: this.getPreferenceTemplateForScope('workspace') });
        }
        open(this.openerService, wsUri);
    }

    private getPreferenceTemplateForScope(scope: string): string {
        return `/*
Preference file for ${scope} scope

Please refer to the documentation online (https://github.com/theia-ide/theia/blob/master/packages/preferences/README.md) to learn how preferences work in Theia
*/`;
    }
}
