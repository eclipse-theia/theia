/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable } from "inversify";
import { MenuContribution, MenuModelRegistry } from "@theia/core";
import { GIT_COMMANDS } from "./git-command";

export const GIT_CONTEXT_MENU: string = 'git-context-menu';

@injectable()
export class GitContextMenu implements MenuContribution {

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerSubmenu([], GIT_CONTEXT_MENU, '');
        menus.registerMenuAction([GIT_CONTEXT_MENU], {
            commandId: GIT_COMMANDS.STATUS.id
        });
        menus.registerMenuAction([GIT_CONTEXT_MENU], {
            commandId: GIT_COMMANDS.REPOSITORIES.id
        })
    }
}