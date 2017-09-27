/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import {
    CommandContribution,
    Command,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry
} from '@theia/core/lib/common';
import { open, OpenerService } from '@theia/core/lib/browser';
import { FileSystem } from "@theia/filesystem/lib/common";
// import { KeymapsService } from "../common/keymaps-service";
import URI from "@theia/core/lib/common/uri";
import { FrontendApplication } from '@theia/core/lib/browser';
import { FileMenus } from '@theia/workspace/lib/browser/workspace-commands';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { KeymapsServer } from '../common/keymaps-protocol';

export namespace KeymapsCommands {
    export const OPEN_KEYMAPS: Command = {
        id: 'keymaps:open',
        label: 'Open Keyboard Shortcuts'
    };
}

@injectable()
export class KeymapsFrontendContribution implements CommandContribution, MenuContribution {

    protected readonly keymapsUri: Promise<string>;
    constructor(
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(KeymapsServer) protected readonly server: KeymapsServer
    ) { this.keymapsUri = this.server.getUri(); }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(KeymapsCommands.OPEN_KEYMAPS, {
            isEnabled: () => true,
            execute: () => this.openKeymapsFile()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(FileMenus.OPEN_GROUP, {
            commandId: KeymapsCommands.OPEN_KEYMAPS.id
        });
    }

    protected openKeymapsFile(): void {
        this.keymapsUri.then((uri => {

            const keymapsURI = new URI(uri);
            this.fileSystem.exists(keymapsURI.toString()).then(exists => {
                if (!exists) {
                    const defaultContent = `/* Custom Key Bindings go inside an array like this:
[
    {
        "command": "quickCommand",
        "keybinding": "ctrl+f4"
    }
]
*/`;
                    this.fileSystem.createFile(keymapsURI.toString(), { content: defaultContent }).then(() => {
                        open(this.openerService, keymapsURI);
                    });
                } else {
                    open(this.openerService, keymapsURI);
                }
            });
        }));

    }

}
