/********************************************************************************
 * Copyright (C) 2018 Arm and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from 'inversify';
import {
    CommandContribution,
    Command,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry,
    SelectionService
} from '@theia/core/lib/common';
import { NavigatorContextMenu } from '@theia/navigator/lib/browser/navigator-contribution';
import { UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { FileSystem } from '@theia/filesystem/lib/common';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import URI from '@theia/core/lib/common/uri';

export namespace WorkbenchCommands {
    export const WORKBENCH_TERMINAL: Command = {
        id: 'workbench:terminal',
        label: 'Open in Terminal'
    };
}

@injectable()
export class WorkbenchFrontendContribution implements CommandContribution, MenuContribution {

    constructor(
        @inject(TerminalService) protected readonly terminal: TerminalService,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(WorkbenchCommands.WORKBENCH_TERMINAL, new UriAwareCommandHandler<URI>(this.selectionService, {
            execute: async uri => {
                // Determine folder path of URI
                const stat = await this.fileSystem.getFileStat(uri.toString());
                if (!stat) {
                    return;
                }
                const cwd = (stat.isDirectory) ? uri.toString() : uri.parent.toString();

                // Open terminal
                const termWidget = await this.terminal.newTerminal({ cwd });
                termWidget.start();
                this.terminal.activateTerminal(termWidget);
            }
        }));
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(NavigatorContextMenu.NEW, {
            commandId: WorkbenchCommands.WORKBENCH_TERMINAL.id
        });
    }
}
