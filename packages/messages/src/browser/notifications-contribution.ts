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
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { NotificationsCommands, NOTIFICATION_CONTEXT_MENU } from './notifications-commands.js';
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core';
import { Notification, NotificationManager } from './notifications-manager.js';
import { NotificationsRenderer } from './notifications-renderer.js';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { nls } from '@theia/core/lib/common/nls';
import { isHighContrast } from '@theia/core/lib/common/theme';

@injectable()
export class NotificationsContribution implements FrontendApplicationContribution, CommandContribution,
    KeybindingContribution, ColorContribution, StylingParticipant, MenuContribution {

    protected readonly id = 'theia-notification-center';

    @inject(NotificationManager)
    protected readonly manager: NotificationManager;

    @inject(NotificationsRenderer)
    protected readonly notificationsRenderer: NotificationsRenderer; // required for initialization

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

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
        commands.registerCommand(NotificationsCommands.COPY_MESSAGE, {
            execute: (notification?: Notification) => {
                if (!notification || !notification.message) {
                    return;
                }
                const plainText = this.notificationToPlainText(notification.message);
                if (plainText) {
                    this.clipboardService.writeText(plainText);
                }
            },
            isEnabled: (notification?: Notification) => !!notification && !!notification.message
        });
    }

    protected notificationToPlainText(html: string): string {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return doc.body.textContent || '';
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(
            [...NOTIFICATION_CONTEXT_MENU, '_copy'],
            {
                commandId: NotificationsCommands.COPY_MESSAGE.id
            }
        );
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: NotificationsCommands.HIDE.id,
            when: 'notificationsVisible',
            keybinding: 'esc'
        });
    }

    /**
     * The notification colors are registered by `NotificationColorContribution` in `@theia/core`.
     * @deprecated since 1.78.0. Kept so that subclasses overriding it are still called.
     * Rebind or extend `NotificationColorContribution` from `@theia/core/lib/browser/notification-color-contribution` instead.
     */
    registerColors(_colors: ColorRegistry): void {
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
