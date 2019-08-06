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
import {
    FrontendApplicationContribution, StatusBar, FrontendApplication, StatusBarAlignment, KeybindingContribution, KeybindingRegistry, KeybindingContext
} from '@theia/core/lib/browser';
import { Keybinding } from '@theia/core/lib/common/keybinding';
import { NotificationsCommands } from './notifications-commands';
import { CommandContribution, CommandRegistry } from '@theia/core';
import { NotificationManager } from './notifications-manager';
import { NotificationsRenderer } from './notifications-renderer';

@injectable()
export class NotificationsContribution implements FrontendApplicationContribution, CommandContribution, KeybindingContribution {

    protected readonly id = 'theia-notification-center';

    @inject(NotificationManager)
    protected readonly manager: NotificationManager;

    @inject(NotificationsRenderer)
    protected readonly notificationsRenderer: NotificationsRenderer; // required for initialization

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    onStart(_app: FrontendApplication): void {
        this.createStatusBarItem();
    }

    protected createStatusBarItem(): void {
        this.updateStatusBarItem();
        this.manager.onUpdated(e => this.updateStatusBarItem(e.notifications.length));
    }
    protected updateStatusBarItem(count: number = 0): void {
        this.statusBar.setElement(this.id, {
            text: this.getStatusBarItemText(count),
            alignment: StatusBarAlignment.RIGHT,
            priority: -900,
            command: NotificationsCommands.TOGGLE.id
        });
    }
    protected getStatusBarItemText(count: number): string {
        return `$(bell) ${count ? ` ${count}` : '' }`;
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(NotificationsCommands.TOGGLE, {
            isEnabled: () => true,
            execute: () => this.manager.toggleCenter()
        });
        commands.registerCommand(NotificationsCommands.HIDE, {
            execute: () => this.manager.hide()
        });
        commands.registerCommand(NotificationsCommands.CLEAR_ALL, {
            execute: () => this.manager.clearAll()
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: NotificationsCommands.HIDE.id,
            context: NotificationsKeybindingContext.notificationsVisible,
            keybinding: 'esc'
        });
    }
}

@injectable()
export class NotificationsKeybindingContext implements KeybindingContext {

    @inject(NotificationManager)
    protected readonly manager: NotificationManager;

    readonly id = NotificationsKeybindingContext.notificationsVisible;
    isEnabled(_arg: Keybinding): boolean {
        return this.manager.centerVisible || this.manager.toastsVisible;
    }

}
export namespace NotificationsKeybindingContext {
    export const notificationsVisible = 'notificationsVisible';
}
