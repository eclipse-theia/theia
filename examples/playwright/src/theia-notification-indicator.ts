/********************************************************************************
 * Copyright (C) 2021 logi.cals GmbH, EclipseSource and others.
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

import { TheiaStatusIndicator } from './theia-status-indicator';

const NOTIFICATION_ICON = 'codicon-bell';
const NOTIFICATION_DOT_ICON = 'codicon-bell-dot';
const NOTIFICATION_ICONS = [NOTIFICATION_ICON, NOTIFICATION_DOT_ICON];

export class TheiaNotificationIndicator extends TheiaStatusIndicator {

    protected get title(): string {
        return 'Notification';
    }

    override async isVisible(): Promise<boolean> {
        return super.isVisible(NOTIFICATION_ICONS, this.title);
    }

    async hasNotifications(): Promise<boolean> {
        return super.isVisible(NOTIFICATION_DOT_ICON, this.title);
    }

    override async waitForVisible(expectNotifications = false): Promise<void> {
        await super.waitForVisibleByIcon(expectNotifications ? NOTIFICATION_DOT_ICON : NOTIFICATION_ICON);
    }

    async toggleOverlay(): Promise<void> {
        const hasNotifications = await this.hasNotifications();
        const element = await this.getElementHandleByIcon(hasNotifications ? NOTIFICATION_DOT_ICON : NOTIFICATION_ICON, this.title);
        if (element) {
            await element.click();
        }
    }

}
