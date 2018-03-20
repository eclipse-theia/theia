/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { KeybindingContext, ApplicationShell } from '@theia/core/lib/browser';
import { FileNavigatorWidget } from "./navigator-widget";

export namespace NavigatorKeybindingContexts {
    export const navigatorActive = 'navigatorActive';
}

@injectable()
export class NavigatorActiveContext implements KeybindingContext {

    readonly id: string = NavigatorKeybindingContexts.navigatorActive;

    @inject(ApplicationShell)
    protected readonly applicationShell: ApplicationShell;

    isEnabled(): boolean {
        return this.applicationShell.activeWidget instanceof FileNavigatorWidget;
    }
}
