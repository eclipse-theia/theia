/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import {ContainerModule} from "inversify";
import {TheiaPlugin} from "../application";
import { BrowserMenuBarContribution, MainMenuFactory } from "./menu-plugin";
import { ContextMenuRenderer, BrowserContextMenuRenderer } from "./context-menu-renderer";

export const browserMenuModule = new ContainerModule(bind => {
    bind(TheiaPlugin).to(BrowserMenuBarContribution);
    bind(ContextMenuRenderer).to(BrowserContextMenuRenderer);
    bind(MainMenuFactory).toSelf().inSingletonScope();
});
