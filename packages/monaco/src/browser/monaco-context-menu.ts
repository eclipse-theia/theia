/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { EDITOR_CONTEXT_MENU_ID } from "@theia/editor/lib/browser";
import { ContextMenuRenderer, toAnchor } from "@theia/core/lib/browser";
import IContextMenuService = monaco.editor.IContextMenuService;
import IContextMenuDelegate = monaco.editor.IContextMenuDelegate;

@injectable()
export class MonacoContextMenuService implements IContextMenuService {

    constructor( @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer) {
    }

    showContextMenu(delegate: IContextMenuDelegate): void {
        this.contextMenuRenderer.render(EDITOR_CONTEXT_MENU_ID, toAnchor(delegate.getAnchor()));
    }

}