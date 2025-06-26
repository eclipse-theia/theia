// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import {
    FrontendApplicationContribution, StatusBar, FrontendApplication, StatusBarAlignment,
    KeybindingContribution, KeybindingRegistry, StylingParticipant, ColorTheme, CssStyleCollector
} from '@theia/core/lib/browser';
import { NotificationsCommands } from './notifications-commands';
import { CommandContribution, CommandRegistry } from '@theia/core';
import { NotificationManager } from './notifications-manager';
import { NotificationsRenderer } from './notifications-renderer';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { Color } from '@theia/core/lib/common/color';
import { nls } from '@theia/core/lib/common/nls';
import { isHighContrast } from '@theia/core/lib/common/theme';

@injectable()
export class NotificationsContribution implements FrontendApplicationContribution, CommandContribution, KeybindingContribution, ColorContribution, StylingParticipant {

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
            tooltip: this.getStatusBarItemTooltip(count),
            accessibilityInformation: {
                label: this.getStatusBarItemTooltip(count)
            }
        });
    }
    protected getStatusBarItemText(count: number): string {
        return `$(${count ? 'codicon-bell-dot' : 'codicon-bell'})${count ? ` ${count}` : ''}`;
    }
    protected getStatusBarItemTooltip(count: number): string {
        if (this.manager.centerVisible) {
            return nls.localizeByDefault('Hide Notifications');
        }
        return count === 0
            ? nls.localizeByDefault('No Notifications')
            : count === 1
                ? nls.localizeByDefault('1 New Notification')
                : nls.localizeByDefault('{0} New Notifications', count.toString());
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(NotificationsCommands.TOGGLE, {
            isEnabled: () => true,
            execute: () => this.manager.toggleCenter()
        });
        commands.registerCommand(NotificationsCommands.SHOW, {
            isEnabled: () => true,
            execute: () => this.manager.showCenter()
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
            when: 'notificationsVisible',
            keybinding: 'esc'
        });
    }

    registerColors(colors: ColorRegistry): void {
        colors.register(
            {
                id: 'notificationCenter.border', defaults: {
                    hcDark: 'contrastBorder',
                    hcLight: 'contrastBorder'
                }, description: 'Notifications center border color. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notificationToast.border', defaults: {
                    hcDark: 'contrastBorder',
                    hcLight: 'contrastBorder'
                }, description: 'Notification toast border color. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notifications.foreground', defaults: {
                    dark: 'editorWidget.foreground',
                    light: 'editorWidget.foreground',
                    hcDark: 'editorWidget.foreground',
                    hcLight: 'editorWidget.foreground'
                }, description: 'Notifications foreground color. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notifications.background', defaults: {
                    dark: 'editorWidget.background',
                    light: 'editorWidget.background',
                    hcDark: 'editorWidget.background',
                    hcLight: 'editorWidget.background'
                }, description: 'Notifications background color. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notificationLink.foreground', defaults: {
                    dark: 'textLink.foreground',
                    light: 'textLink.foreground',
                    hcDark: 'textLink.foreground',
                    hcLight: 'textLink.foreground'
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
                    hcDark: 'notifications.background',
                    hcLight: 'notifications.background'
                }, description: 'Notifications center header background color. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notifications.border', defaults: {
                    dark: 'notificationCenterHeader.background',
                    light: 'notificationCenterHeader.background',
                    hcDark: 'notificationCenterHeader.background',
                    hcLight: 'notificationCenterHeader.background'
                    // eslint-disable-next-line max-len
                }, description: 'Notifications border color separating from other notifications in the notifications center. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notificationsErrorIcon.foreground', defaults: {
                    dark: 'editorError.foreground',
                    light: 'editorError.foreground',
                    hcDark: 'editorError.foreground',
                    hcLight: 'editorError.foreground'
                }, description: 'The color used for the icon of error notifications. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notificationsWarningIcon.foreground', defaults: {
                    dark: 'editorWarning.foreground',
                    light: 'editorWarning.foreground',
                    hcDark: 'editorWarning.foreground',
                    hcLight: 'editorWarning.foreground'
                }, description: 'The color used for the icon of warning notifications. Notifications slide in from the bottom right of the window.'
            },
            {
                id: 'notificationsInfoIcon.foreground', defaults: {
                    dark: 'editorInfo.foreground',
                    light: 'editorInfo.foreground',
                    hcDark: 'editorInfo.foreground',
                    hcLight: 'editorInfo.foreground'
                }, description: 'The color used for the icon of info notifications. Notifications slide in from the bottom right of the window.'
            }
        );
    }

    registerThemeStyle(theme: ColorTheme, collector: CssStyleCollector): void {
        const notificationsBackground = theme.getColor('notifications.background');
        if (notificationsBackground) {
            collector.addRule(`
                .theia-notification-list-item-container {
                    background-color: ${notificationsBackground};
                }
            `);
        }
        const notificationHover = theme.getColor('list.hoverBackground');
        if (notificationHover) {
            collector.addRule(`
                .theia-notification-list-item:hover:not(:focus) {
                    background-color: ${notificationHover};
                }
            `);
        }
        const focusBorder = theme.getColor('focusBorder');
        if (focusBorder && isHighContrast(theme.type)) {
            collector.addRule(`
                .theia-notification-list-item:hover:not(:focus) {
                    outline: 1px dashed ${focusBorder};
                    outline-offset: -2px;
                }
            `);
        }
    }
}
