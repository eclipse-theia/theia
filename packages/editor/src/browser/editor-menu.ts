/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { MenuContribution, MenuModelRegistry, MenuPath } from "@theia/core";
import { CommonCommands } from "@theia/core/lib/browser";

export const EDITOR_CONTEXT_MENU: MenuPath = ['editor_context_menu'];

export namespace EditorContextMenu {
    export const UNDO_REDO = [...EDITOR_CONTEXT_MENU, '1_undo'];
    export const NAVIGATION = [...EDITOR_CONTEXT_MENU, 'navigation'];
}

@injectable()
export class EditorMenuContribution implements MenuContribution {

    registerMenus(registry: MenuModelRegistry) {
        registry.registerMenuAction(EditorContextMenu.UNDO_REDO, {
            commandId: CommonCommands.UNDO.id
        });
        registry.registerMenuAction(EditorContextMenu.UNDO_REDO, {
            commandId: CommonCommands.REDO.id
        });
    }

}
