/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { MenuPath } from '../../common/menu';
import { ContextMenuRenderer, Anchor } from "../context-menu-renderer";
import { BrowserMainMenuFactory } from "./browser-menu-plugin";

@injectable()
export class BrowserContextMenuRenderer implements ContextMenuRenderer {

    constructor( @inject(BrowserMainMenuFactory) private menuFactory: BrowserMainMenuFactory) {
    }

    render(menuPath: MenuPath, anchor: Anchor, onHide?: () => void): void {
        const contextMenu = this.menuFactory.createContextMenu(menuPath);
        const { x, y } = anchor instanceof MouseEvent ? { x: anchor.clientX, y: anchor.clientY } : anchor;
        if (onHide) {
            contextMenu.aboutToClose.connect(() => onHide());
        }
        contextMenu.open(x, y);
    }

}
