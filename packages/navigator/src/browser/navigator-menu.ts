/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { MenuContribution, MenuModelRegistry, MenuPath } from "@theia/core/lib/common";
import { OpenerService, CommonCommands } from '@theia/core/lib/browser';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';

export const NAVIGATOR_CONTEXT_MENU: MenuPath = ['navigator-context-menu'];

export namespace NavigatorContextMenu {
    export const OPEN = [...NAVIGATOR_CONTEXT_MENU, '1_open'];
    export const OPEN_WITH = [...OPEN, 'open_with'];
    export const CLIPBOARD = [...NAVIGATOR_CONTEXT_MENU, '2_clipboard'];
    export const MOVE = [...NAVIGATOR_CONTEXT_MENU, '3_move'];
    export const NEW = [...NAVIGATOR_CONTEXT_MENU, '4_new'];
}

@injectable()
export class NavigatorMenuContribution implements MenuContribution {

    constructor(
        @inject(OpenerService) protected readonly openerService: OpenerService
    ) { }

    registerMenus(registry: MenuModelRegistry) {
        registry.registerMenuAction(NavigatorContextMenu.OPEN, {
            commandId: WorkspaceCommands.FILE_OPEN.id
        });
        registry.registerSubmenu(NavigatorContextMenu.OPEN_WITH, 'Open With');
        this.openerService.getOpeners().then(openers => {
            for (const opener of openers) {
                const openWithCommand = WorkspaceCommands.FILE_OPEN_WITH(opener);
                registry.registerMenuAction(NavigatorContextMenu.OPEN_WITH, {
                    commandId: openWithCommand.id
                });
            }
        });

        // registry.registerMenuAction([CONTEXT_MENU_PATH, CUT_MENU_GROUP], {
        //     commandId: Commands.FILE_CUT
        // });
        registry.registerMenuAction(NavigatorContextMenu.CLIPBOARD, {
            commandId: CommonCommands.COPY.id
        });
        registry.registerMenuAction(NavigatorContextMenu.CLIPBOARD, {
            commandId: CommonCommands.PASTE.id
        });

        registry.registerMenuAction(NavigatorContextMenu.MOVE, {
            commandId: WorkspaceCommands.FILE_RENAME.id
        });
        registry.registerMenuAction(NavigatorContextMenu.MOVE, {
            commandId: WorkspaceCommands.FILE_DELETE.id
        });

        registry.registerMenuAction(NavigatorContextMenu.NEW, {
            commandId: WorkspaceCommands.NEW_FILE.id
        });
        registry.registerMenuAction(NavigatorContextMenu.NEW, {
            commandId: WorkspaceCommands.NEW_FOLDER.id
        });
    }
}
