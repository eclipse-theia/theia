/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify"
import {
    CommandContribution,
    Command,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry,
    MAIN_MENU_BAR
} from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';
import { FrontendApplication } from '@theia/core/lib/browser';
import { TERMINAL_WIDGET_FACTORY_ID, TerminalWidgetFactoryOptions } from '@theia/terminal/lib/browser/terminal-widget';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { IDebugServer } from '@theia/debug/lib/common/debug-protocol';

export const GDB_CONTEXT_MENU = 'gdb-context-menu';

export namespace GDBCommands {
    export const NEW_SESSION: Command = {
        id: 'gdb:new-session',
        label: 'New GDB Session'
    };

    export const NEW_TERMINAL: Command = {
        id: 'gdb:new-terminal',
        label: 'New GDB Terminal'
    };
}

@injectable()
export class GDBFrontendContribution implements CommandContribution, MenuContribution {

    constructor(
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(IDebugServer) protected readonly debugServer: IDebugServer,
        @inject(ILogger) protected readonly logger: ILogger
    ) { }
    registerCommands(commands: CommandRegistry): void {

        commands.registerCommand(GDBCommands.NEW_SESSION, {
            isEnabled: () => true,
            execute: () => this.newSession()
        });

        commands.registerCommand(GDBCommands.NEW_TERMINAL, {
            isEnabled: () => true,
            execute: () => this.newTerminal()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerSubmenu([MAIN_MENU_BAR], 'gdb', 'GDB');
        menus.registerMenuAction([MAIN_MENU_BAR, 'gdb'], {
            commandId: GDBCommands.NEW_SESSION.id
        });
        menus.registerMenuAction([MAIN_MENU_BAR, 'gdb'], {
            commandId: GDBCommands.NEW_TERMINAL.id
        });
    }


    protected async newTerminal(): Promise<void> {
        await this.widgetManager.getOrCreateWidget(TERMINAL_WIDGET_FACTORY_ID, <TerminalWidgetFactoryOptions>{
            created: new Date().toString(),
            /* FIXME this is just for testing , should be managed */
            attachId: 0
        });
    }

    protected async newSession(): Promise<void> {
        const sessionId = await this.debugServer.createSession();
        this.logger.info("Created GDB Session ID: " + sessionId);
    }
}
