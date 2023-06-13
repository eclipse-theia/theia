// *****************************************************************************
// Copyright (C) 2021 logi.cals GmbH, EclipseSource and others.
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

import { TheiaApp } from './theia-app';
import { TheiaNotificationIndicator } from './theia-notification-indicator';
import { TheiaPageObject } from './theia-page-object';

export class TheiaNotificationOverlay extends TheiaPageObject {

    protected readonly HEADER_NOTIFICATIONS = 'NOTIFICATIONS';
    protected readonly HEADER_NO_NOTIFICATIONS = 'NO NEW NOTIFICATIONS';

    constructor(app: TheiaApp, protected notificationIndicator: TheiaNotificationIndicator) {
        super(app);
    }

    protected get selector(): string {
        return '.theia-notifications-overlay';
    }

    protected get containerSelector(): string {
        return `${this.selector} .theia-notifications-container.theia-notification-center`;
    }

    protected get titleSelector(): string {
        return `${this.containerSelector} .theia-notification-center-header-title`;
    }

    async isVisible(): Promise<boolean> {
        const element = await this.page.$(`${this.containerSelector}.open`);
        return element ? element.isVisible() : false;
    }

    async waitForVisible(): Promise<void> {
        await this.page.waitForSelector(`${this.containerSelector}.open`);
    }

    async activate(): Promise<void> {
        if (!await this.isVisible()) {
            await this.notificationIndicator.toggleOverlay();
        }
        await this.waitForVisible();
    }

    async toggle(): Promise<void> {
        await this.app.quickCommandPalette.type('Toggle Notifications');
        await this.app.quickCommandPalette.trigger('Notifications: Toggle Notifications');
    }

    protected entrySelector(entryText: string): string {
        return `${this.containerSelector} .theia-notification-message span:has-text("${entryText}")`;
    }

    async waitForEntry(entryText: string): Promise<void> {
        await this.activate();
        await this.page.waitForSelector(this.entrySelector(entryText));
    }

    async waitForEntryDetached(entryText: string): Promise<void> {
        await this.activate();
        await this.page.waitForSelector(this.entrySelector(entryText), { state: 'detached' });
    }

    async isEntryVisible(entryText: string): Promise<boolean> {
        await this.activate();
        const element = await this.page.$(this.entrySelector(entryText));
        return !!element && element.isVisible();
    }

    protected get clearAllButtonSelector(): string {
        return this.selector + ' .theia-notification-center-header ul > li.codicon.codicon-clear-all';
    }

    async clearAllNotifications(): Promise<void> {
        await this.activate();
        const element = await this.page.waitForSelector(this.clearAllButtonSelector);
        await element.click();
        await this.notificationIndicator.waitForVisible(false /* expectNotifications */);
    }

}
