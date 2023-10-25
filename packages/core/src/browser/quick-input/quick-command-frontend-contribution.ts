// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
import { injectable, inject, optional } from 'inversify';
import { CommandRegistry, CommandContribution, MenuContribution, MenuModelRegistry, nls } from '../../common';
import { KeybindingRegistry, KeybindingContribution } from '../keybinding';
import { CommonMenus } from '../common-frontend-contribution';
import { CLOSE_QUICK_OPEN, CLEAR_COMMAND_HISTORY, quickCommand, QuickCommandService } from './quick-command-service';
import { QuickInputService } from './quick-input-service';
import { ConfirmDialog, Dialog } from '../dialogs';

@injectable()
export class QuickCommandFrontendContribution implements CommandContribution, KeybindingContribution, MenuContribution {

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;

    @inject(QuickCommandService) @optional()
    protected readonly quickCommandService: QuickCommandService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(quickCommand, {
            execute: () => {
                this.quickInputService?.open('>');
            }
        });
        commands.registerCommand(CLEAR_COMMAND_HISTORY, {
            execute: async () => {
                const shouldClear = await new ConfirmDialog({
                    title: nls.localizeByDefault('Clear Command History'),
                    msg: nls.localizeByDefault('Do you want to clear the history of recently used commands?'),
                    ok: nls.localizeByDefault('Clear'),
                    cancel: Dialog.CANCEL,
                }).open();
                if (shouldClear) {
                    commands.clearCommandHistory();
                }
            }
        });
        commands.registerCommand(CLOSE_QUICK_OPEN, {
            execute: () => this.quickInputService?.hide()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.VIEW_PRIMARY, {
            commandId: quickCommand.id,
            label: nls.localizeByDefault('Command Palette...')
        });
        menus.registerMenuAction(CommonMenus.MANAGE_GENERAL, {
            commandId: quickCommand.id,
            label: nls.localizeByDefault('Command Palette...'),
            order: '0'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: quickCommand.id,
            keybinding: 'f1'
        });
        keybindings.registerKeybinding({
            command: quickCommand.id,
            keybinding: 'ctrlcmd+shift+p'
        });
        keybindings.registerKeybinding({
            command: CLOSE_QUICK_OPEN.id,
            keybinding: 'esc',
            when: 'inQuickOpen'
        });
        keybindings.registerKeybinding({
            command: CLOSE_QUICK_OPEN.id,
            keybinding: 'shift+esc',
            when: 'inQuickOpen'
        });
    }
}
