/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from 'inversify';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';

export const NavigatorConfigSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'navigator.autoReveal.enabled': {
            'type': 'boolean',
            'description': 'Automatically reveals the corresponding file in the navigator.',
            'default': true
        }
    }
};

export interface NavigatorConfiguration {
    'navigator.autoReveal.enabled': boolean
}

export const NavigatorPreferences = Symbol('NavigatorPreferences');
export type NavigatorPreferences = PreferenceProxy<NavigatorConfiguration>;

export function createNavigatorPreferences(preferences: PreferenceService): NavigatorPreferences {
    return createPreferenceProxy(preferences, NavigatorConfigSchema);
}

export function bindNavigatorPreferences(bind: interfaces.Bind): void {
    bind(NavigatorPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createNavigatorPreferences(preferences);
    });
    bind(PreferenceContribution).toConstantValue({ schema: NavigatorConfigSchema });
}
