/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { KeybindingContext, ApplicationShell } from "@theia/core/lib/browser";
import { TerminalWidget } from "./terminal-widget";

export namespace TerminalKeybindingContexts {
    export const terminalActive = 'terminalActive';
}

@injectable()
export class TerminalActiveContext implements KeybindingContext {
    readonly id: string = TerminalKeybindingContexts.terminalActive;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    isEnabled(): boolean {
        return this.shell.activeWidget instanceof TerminalWidget;
    }
}
