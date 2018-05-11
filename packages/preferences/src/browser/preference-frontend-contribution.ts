/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
