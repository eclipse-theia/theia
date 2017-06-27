/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { ContextMenuRenderer, Anchor } from "../../browser";
import { ElectronMainMenuFactory } from "./electron-menu-plugin";

@injectable()
export class ElectronContextMenuRenderer implements ContextMenuRenderer {

    constructor( @inject(ElectronMainMenuFactory) private menuFactory: ElectronMainMenuFactory) {
    }

    render(path: string, anchor: Anchor): void {
        const menu = this.menuFactory.createContextMenu(path);
        menu.popup();
    }

}