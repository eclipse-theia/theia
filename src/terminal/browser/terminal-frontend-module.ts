/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { WebSocketConnectionProvider } from '../../messaging/browser';
import { Widget } from '@phosphor/widgets/lib';
import { Commands } from '../../filesystem/browser/filesystem-commands';
import { MenuModelRegistry, MenuContribution, MAIN_MENU_BAR } from '../../application/common/menu';
import { CommandContribution, CommandRegistry } from '../../application/common/command';
import { FrontendApplication } from '../../application/browser';
import { ContainerModule, inject, injectable } from "inversify"
import { TerminalWidget } from "./terminal-widget";
import { ILogger } from '../../application/common/logger';

export default new ContainerModule(bind => {
    bind<CommandContribution>(CommandContribution).to(TerminalCommands)
    bind<MenuContribution>(MenuContribution).to(TerminalMenuContribution)
})

let CMD_OPEN_TERMINAL = 'open-terminal';

@injectable()
class TerminalCommands implements CommandContribution {

    constructor( @inject(FrontendApplication) private app: FrontendApplication, @inject(WebSocketConnectionProvider) private wsProvider: WebSocketConnectionProvider,
        @inject(ILogger) private logger: ILogger) {
    }

    contribute(registry: CommandRegistry): void {
        registry.registerCommand({
            id: CMD_OPEN_TERMINAL,
            label: 'New Terminal'
        })
        registry.registerHandler(CMD_OPEN_TERMINAL, {
            execute: () => {
                let newTerminal: Widget = new TerminalWidget(this.wsProvider)
                this.app.shell.addToMainArea(newTerminal)
                this.app.shell.activateMain(newTerminal.id)
                this.logger.debug('Started terminal id: %s', newTerminal.id);
            },
            isEnabled: () => true
        })
    }
}

@injectable()
class TerminalMenuContribution implements MenuContribution {

    contribute(registry: MenuModelRegistry): void {
        registry.registerMenuAction([MAIN_MENU_BAR, Commands.FILE_MENU, "2_open"], {
            commandId: CMD_OPEN_TERMINAL,
        })
    }

}