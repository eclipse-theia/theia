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

import { TheiaStatusIndicator } from './theia-status-indicator';

const NOTIFICATION_DOT_ICON = 'codicon-bell-dot';

export class TheiaNotificationIndicator extends TheiaStatusIndicator {
    id = 'theia-notification-center';

    async hasNotifications(): Promise<boolean> {
        const container = await this.getElementHandle();
        const bellWithDot = await container.$(`.${NOTIFICATION_DOT_ICON}`);
        return Boolean(bellWithDot?.isVisible());
    }

    override async waitForVisible(expectNotifications = false): Promise<void> {
        await super.waitForVisible();
        if (expectNotifications && !(await this.hasNotifications())) {
            throw new Error('No notifications when notifications expected.');
        }
    }

    async toggleOverlay(): Promise<void> {
        const element = await this.getElementHandle();
        if (element) {
            await element.click();
        }
    }

}
