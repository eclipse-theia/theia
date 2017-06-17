/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify"
import {
    CommandContribution, Command, CommandRegistry,
    MenuContribution, MenuModelRegistry
} from '../../application/common';
import { FrontendApplication } from '../../application/browser';
import { FileMenus } from '../../filesystem/browser/filesystem-commands';
import { TerminalWidgetFactory } from './terminal-widget';

export namespace TerminalCommands {
    export const NEW: Command = {
        id: 'terminal:new',
        label: 'New Terminal'
    }
}

@injectable()
export class TerminalFrontendContribution implements CommandContribution, MenuContribution {

    constructor(
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(TerminalWidgetFactory) protected readonly terminalWidgetFactory: TerminalWidgetFactory
    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(TerminalCommands.NEW, {
            isEnabled: () => true,
            execute: () => this.newTerminal()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(FileMenus.OPEN_GROUP, {
            commandId: TerminalCommands.NEW.id
        });
    }

    protected newTerminal(): void {
        const newTerminal = this.terminalWidgetFactory();
        this.app.shell.addToMainArea(newTerminal);
        this.app.shell.activateMain(newTerminal.id);
    }

}
