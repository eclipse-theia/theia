/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify"
import { Command } from '../../application/common';
import { FrontendApplication, FrontendApplicationContribution } from '../../application/browser';
import { FileMenus } from '../../filesystem/browser/filesystem-commands';
import { TerminalWidgetFactory } from "./terminal-widget";

export namespace TerminalCommands {
    export const NEW: Command = {
        id: 'terminal:new',
        label: 'New Terminal'
    }
}

@injectable()
export class TerminalFrontendContribution implements FrontendApplicationContribution {

    constructor(
        @inject(TerminalWidgetFactory) protected readonly terminalWidgetFactory: TerminalWidgetFactory
    ) { }

    onInitialize(app: FrontendApplication): void {
        const { commands, menus } = app;
        commands.registerCommand(TerminalCommands.NEW, {
            isEnabled: () => true,
            execute: () => {
                const newTerminal = this.terminalWidgetFactory();
                app.shell.addToMainArea(newTerminal);
                app.shell.activateMain(newTerminal.id);
            },
        });
        menus.registerMenuAction(FileMenus.OPEN_GROUP, {
            commandId: TerminalCommands.NEW.id
        });
    }

}
