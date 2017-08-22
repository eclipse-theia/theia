/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify"
import { CommandContribution, CommandRegistry } from "../../common"
import * as electron from "electron"

@injectable()
export class ElectronCommandHandlers implements CommandContribution {
    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand({
            id: 'theia.electron.toggle.dev.tools',
            label: 'Toggle Electron Developer Tools'
        });
        registry.registerHandler('theia.electron.toggle.dev.tools', {
            execute: (): any => {
                const webContent = electron.remote.getCurrentWebContents();
                if (!webContent.isDevToolsOpened()) {
                    webContent.openDevTools();
                } else {
                    webContent.closeDevTools();
                }
                return null;
            }
        });

    }
}