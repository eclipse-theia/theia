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

import { injectable, inject } from '@theia/core/shared/inversify';
import {
    FrontendApplicationContribution, StatusBar, FrontendApplication, StatusBarAlignment, KeybindingContribution, KeybindingRegistry, KeybindingContext
} from '@theia/core/lib/browser';
import { Keybinding } from '@theia/core/lib/common/keybinding';
import { NotificationsCommands } from './notifications-commands';
import { CommandContribution, CommandRegistry } from '@theia/core';
import { NotificationManager } from './notifications-manager';
import { NotificationsRenderer } from './notifications-renderer';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry, Color } from '@theia/core/lib/browser/color-registry';

@injectable()
export class NotificationsContribution implements FrontendApplicationContribution, CommandContribution, KeybindingContribution, ColorContribution {

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
            command: NotificationsCommands.TOGGLE.id,
            tooltip: this.getStatusBarItemTooltip(count)
        });
    }
    protected getStatusBarItemText(count: number): string {
        return `$(bell) ${count ? ` ${count}` : ''}`;
    }
    protected getStatusBarItemTooltip(count: number): string {
        if (this.manager.centerVisible) {
            return 'Hide Notifications';
        }
        return count === 0
            ? 'No Notifications'
            : count === 1 ? '1 Notification' : `${count} Notifications`;
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

    registerColors(colors: ColorRegistry): void {
        colors.register(
            {
                id: 'notificationCenter.border', defaults: {
                    hc: 'contrastBorder'
                }, description: 'Notifications center border color. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notificationToast.border', defaults: {
                    hc: 'contrastBorder'
                }, description: 'Notification toast border color. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notifications.foreground', defaults: {
                    dark: 'editorWidget.foreground',
                    light: 'editorWidget.foreground',
                    hc: 'editorWidget.foreground'
                }, description: 'Notifications foreground color. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notifications.background', defaults: {
                    dark: 'editorWidget.background',
                    light: 'editorWidget.background',
                    hc: 'editorWidget.background'
                }, description: 'Notifications background color. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notificationLink.foreground', defaults: {
                    dark: 'textLink.foreground',
                    light: 'textLink.foreground',
                    hc: 'textLink.foreground'
                }, description: 'Notification links foreground color. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notificationCenterHeader.foreground',
                description: 'Notifications center header foreground color. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notificationCenterHeader.background', defaults: {
                    dark: Color.lighten('notifications.background', 0.3),
                    light: Color.darken('notifications.background', 0.05),
                    hc: 'notifications.background'
                }, description: 'Notifications center header background color. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notifications.border', defaults: {
                    dark: 'notificationCenterHeader.background',
                    light: 'notificationCenterHeader.background',
                    hc: 'notificationCenterHeader.background'
                    // eslint-disable-next-line max-len
                }, description: 'Notifications border color separating from other notifications in the notifications center. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notificationsErrorIcon.foreground', defaults: {
                    dark: 'editorError.foreground',
                    light: 'editorError.foreground',
                    hc: 'editorError.foreground'
                }, description: 'The color used for the icon of error notifications. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notificationsWarningIcon.foreground', defaults: {
                    dark: 'editorWarning.foreground',
                    light: 'editorWarning.foreground',
                    hc: 'editorWarning.foreground'
                }, description: 'The color used for the icon of warning notifications. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notificationsInfoIcon.foreground', defaults: {
                    dark: 'editorInfo.foreground',
                    light: 'editorInfo.foreground',
                    hc: 'editorInfo.foreground'
                }, description: 'The color used for the icon of info notifications. Notifications slide in from the bottom right of the window.'
            }
        );
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
