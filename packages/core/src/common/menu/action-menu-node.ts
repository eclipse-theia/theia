// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CommandRegistry } from '../command';
import { AlternativeHandlerMenuNode, CommandMenuNode, MenuAction, MenuNode } from './menu-types';

/**
 * Node representing an action in the menu tree structure.
 * It's based on {@link MenuAction} for which it tries to determine the
 * best label, icon and sortString with the given data.
 */
export class ActionMenuNode implements MenuNode, CommandMenuNode, Partial<AlternativeHandlerMenuNode> {

    readonly altNode: ActionMenuNode | undefined;

    constructor(
        protected readonly action: MenuAction,
        protected readonly commands: CommandRegistry,
    ) {
        if (action.alt) {
            this.altNode = new ActionMenuNode({ commandId: action.alt }, commands);
        }
    }

    get command(): string { return this.action.commandId; };

    get when(): string | undefined { return this.action.when; }

    get id(): string { return this.action.commandId; }

    get label(): string {
        if (this.action.label) {
            return this.action.label;
        }
        const cmd = this.commands.getCommand(this.action.commandId);
        if (!cmd) {
            console.debug(`No label for action menu node: No command "${this.action.commandId}" exists.`);
            return '';
        }
        return cmd.label || cmd.id;
    }

    get icon(): string | undefined {
        if (this.action.icon) {
            return this.action.icon;
        }
        const command = this.commands.getCommand(this.action.commandId);
        return command && command.iconClass;
    }

    get sortString(): string { return this.action.order || this.label; }
}
