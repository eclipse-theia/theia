/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { MessageClient } from '@theia/core/lib/common';
import { NotificationManager } from './notifications-manager';
import { bindNotificationPreferences } from './notification-preferences';
import { NotificationsRenderer } from './notifications-renderer';
import { NotificationsContribution, NotificationsKeybindingContext } from './notifications-contribution';
import { FrontendApplicationContribution, KeybindingContribution, KeybindingContext } from '@theia/core/lib/browser';
import { CommandContribution } from '@theia/core';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { NotificationContentRenderer } from './notification-content-renderer';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(NotificationContentRenderer).toSelf().inSingletonScope();
    bind(NotificationsRenderer).toSelf().inSingletonScope();
    bind(NotificationsContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(NotificationsContribution);
    bind(CommandContribution).toService(NotificationsContribution);
    bind(KeybindingContribution).toService(NotificationsContribution);
    bind(ColorContribution).toService(NotificationsContribution);
    bind(NotificationsKeybindingContext).toSelf().inSingletonScope();
    bind(KeybindingContext).toService(NotificationsKeybindingContext);
    bind(NotificationManager).toSelf().inSingletonScope();
    rebind(MessageClient).toService(NotificationManager);
    bindNotificationPreferences(bind);
});
