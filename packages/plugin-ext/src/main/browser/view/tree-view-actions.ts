/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { CommandRegistry, Command } from '@theia/core/lib/common/command';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { Menu } from '../../../common/plugin-protocol';

// tslint:disable:no-any

@injectable()
export class TreeViewActions {

    protected inlineActions: Menu[] = [];

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    registerInlineAction(action: Menu): void {
        this.inlineActions.push(action);
    }

    getInlineCommands(...args: any[]): Command[] {
        const commands: Command[] = [];
        for (const action of this.inlineActions) {
            const command = this.commands.getCommand(action.command);
            if (command &&
                this.commands.isVisible(command.id, ...args)
                && (!action.when || this.contextKeyService.match(action.when))) {
                commands.push(command);
            }
        }
        return commands;
    }

}
