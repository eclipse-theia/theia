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
        const commands = [GIT_COMMANDS.FETCH, GIT_COMMANDS.PULL, GIT_COMMANDS.PUSH, GIT_COMMANDS.MERGE];
        commands.map(command => command.id).forEach(commandId =>
            menus.registerMenuAction([GIT_CONTEXT_MENU], {
                commandId
            })
        );
    }

}
