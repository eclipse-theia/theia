/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";
import { OpenerService } from '@theia/core/lib/browser';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';

export const NAVIGATOR_CONTEXT_MENU = 'navigator-context-menu';

export const OPEN_MENU_GROUP = '1_open';
export const OPEN_WITH_MENU = 'open-with';
export const CUT_MENU_GROUP = '2_cut/copy/paste';
export const MOVE_MENU_GROUP = '3_move';
export const NEW_MENU_GROUP = '4_new';

@injectable()
export class NavigatorMenuContribution implements MenuContribution {

    constructor(
        @inject(OpenerService) protected readonly openerService: OpenerService
    ) { }

    registerMenus(registry: MenuModelRegistry) {
        registry.registerMenuAction([NAVIGATOR_CONTEXT_MENU, OPEN_MENU_GROUP], {
            commandId: WorkspaceCommands.FILE_OPEN
        });
        registry.registerSubmenu([NAVIGATOR_CONTEXT_MENU, OPEN_MENU_GROUP], OPEN_WITH_MENU, 'Open With');
        this.openerService.getOpeners().then(openers => {
            for (const opener of openers) {
                const openWithCommand = WorkspaceCommands.FILE_OPEN_WITH(opener);
                registry.registerMenuAction([NAVIGATOR_CONTEXT_MENU, OPEN_MENU_GROUP, OPEN_WITH_MENU], {
                    commandId: openWithCommand.id
                });
            }
        });
        // registry.registerMenuAction([CONTEXT_MENU_PATH, CUT_MENU_GROUP], {
        //     commandId: Commands.FILE_CUT
        // });
        registry.registerMenuAction([NAVIGATOR_CONTEXT_MENU, CUT_MENU_GROUP], {
            commandId: WorkspaceCommands.FILE_COPY
        });
        registry.registerMenuAction([NAVIGATOR_CONTEXT_MENU, CUT_MENU_GROUP], {
            commandId: WorkspaceCommands.FILE_PASTE
        });
        registry.registerMenuAction([NAVIGATOR_CONTEXT_MENU, MOVE_MENU_GROUP], {
            commandId: WorkspaceCommands.FILE_RENAME
        });
        registry.registerMenuAction([NAVIGATOR_CONTEXT_MENU, MOVE_MENU_GROUP], {
            commandId: WorkspaceCommands.FILE_DELETE
        });
        registry.registerMenuAction([NAVIGATOR_CONTEXT_MENU, NEW_MENU_GROUP], {
            commandId: WorkspaceCommands.NEW_FILE
        });
        registry.registerMenuAction([NAVIGATOR_CONTEXT_MENU, NEW_MENU_GROUP], {
            commandId: WorkspaceCommands.NEW_FOLDER
        });
    }
}
