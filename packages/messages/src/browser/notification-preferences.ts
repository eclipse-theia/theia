// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceContribution,
    PreferenceSchema
} from '@theia/core/lib/browser/preferences';
import { nls } from '@theia/core/lib/common/nls';

export const NotificationConfigSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'notification.timeout': {
            'type': 'number',
            'description': nls.localize('theia/messages/notificationTimeout', 'Informative notifications will be hidden after this timeout.'),
            'default': 30 * 1000 // `0` and negative values are treated as no timeout.
        }
    }
};

export interface NotificationConfiguration {
    'notification.timeout': number
}

export const NotificationPreferenceContribution = Symbol('NotificationPreferenceContribution');
export const NotificationPreferences = Symbol('NotificationPreferences');
export type NotificationPreferences = PreferenceProxy<NotificationConfiguration>;

export function createNotificationPreferences(preferences: PreferenceService, schema: PreferenceSchema = NotificationConfigSchema): NotificationPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindNotificationPreferences(bind: interfaces.Bind): void {
    bind(NotificationPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(NotificationPreferenceContribution);
        return createNotificationPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(NotificationPreferenceContribution).toConstantValue({ schema: NotificationConfigSchema });
    bind(PreferenceContribution).toService(NotificationPreferenceContribution);
}
