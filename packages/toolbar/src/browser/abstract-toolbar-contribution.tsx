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

import * as React from '@theia/core/shared/react';
import { CommandService, Emitter } from '@theia/core';
import { injectable, inject } from '@theia/core/shared/inversify';
import { ContextMenuRenderer, KeybindingRegistry } from '@theia/core/lib/browser';
import { DeflatedContributedToolbarItem, ToolbarContribution } from './toolbar-interfaces';

@injectable()
export abstract class AbstractToolbarContribution implements ToolbarContribution {
    @inject(KeybindingRegistry) protected readonly keybindingRegistry: KeybindingRegistry;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;
    @inject(CommandService) protected readonly commandService: CommandService;

    abstract id: string;

    protected didChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.didChangeEmitter.event;

    abstract render(): React.ReactNode;

    toJSON(): DeflatedContributedToolbarItem {
        return { id: this.id, group: 'contributed' };
    }

    protected resolveKeybindingForCommand(commandID: string | undefined): string {
        if (!commandID) {
            return '';
        }
        const keybindings = this.keybindingRegistry.getKeybindingsForCommand(commandID);
        if (keybindings.length > 0) {
            const binding = keybindings[0];
            const bindingKeySequence = this.keybindingRegistry.resolveKeybinding(binding);
            const keyCode = bindingKeySequence[0];
            return ` (${this.keybindingRegistry.acceleratorForKeyCode(keyCode, '+')})`;
        }
        return '';
    }
}
