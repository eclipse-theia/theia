/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { ContextMenuRenderer, toAnchor } from "../../application/browser/menu/context-menu-renderer";
import IContextMenuService = monaco.editor.IContextMenuService;
import IContextMenuDelegate = monaco.editor.IContextMenuDelegate;

export const EDITOR_CONTEXT_MENU_ID = 'editor_context_menu';

export const EditorContextMenuService = Symbol("EditorContextMenuService");

export interface EditorContextMenuService extends IContextMenuService {

}

@injectable()
export class BrowserContextMenuService implements EditorContextMenuService {

    constructor(@inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer) {
    }

    showContextMenu(delegate: IContextMenuDelegate): void {
        this.contextMenuRenderer.render(EDITOR_CONTEXT_MENU_ID, toAnchor(delegate.getAnchor()));
    }

}