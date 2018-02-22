/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from "inversify";
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceContribution,
    PreferenceSchema
} from '@theia/core/lib/browser/preferences';

export const NotificationConfigSchema: PreferenceSchema = {
    "type": "object",
    "properties": {
        "notification.timeout": {
            "type": "number",
            "description": "The time before auto-dismiss the notification.",
            "default": 5000 // time express in millisec. 0 means : Do not remove
        }
    }
};

export interface NotificationConfiguration {
    'notification.timeout': number
}

export const NotificationPreferences = Symbol('NotificationPreferences');
export type NotificationPreferences = PreferenceProxy<NotificationConfiguration>;

export function createNotificationPreferences(preferences: PreferenceService): NotificationPreferences {
    return createPreferenceProxy(preferences, NotificationConfigSchema);
}

export function bindNotificationPreferences(bind: interfaces.Bind): void {
    bind(NotificationPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createNotificationPreferences(preferences);
    });

    bind(PreferenceContribution).toConstantValue({ schema: NotificationConfigSchema });
}
