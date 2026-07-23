// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { nls } from '@theia/core/lib/common/nls';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import { createPreferenceProxy, PreferenceProxy } from '@theia/core/lib/common/preferences/preference-proxy';
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { interfaces } from '@theia/core/shared/inversify';

export const ANALYTICS_ENABLED = 'analytics.enabled';
export const ANALYTICS_ROUTES = 'analytics.routes';

export type AnalyticsRoutes = Record<string, string[]>;

export interface AnalyticsConfiguration {
    [ANALYTICS_ENABLED]: boolean;
    [ANALYTICS_ROUTES]: AnalyticsRoutes;
}

export const AnalyticsPreferenceSchema: PreferenceSchema = {
    scope: PreferenceScope.User,
    properties: {
        [ANALYTICS_ENABLED]: {
            type: 'boolean',
            default: false,
            description: nls.localize('theia/analytics/enabled', 'Enable analytics event delivery.')
        },
        [ANALYTICS_ROUTES]: {
            type: 'object',
            additionalProperties: {
                type: 'array',
                items: {
                    type: 'string'
                }
            },
            default: {},
            description: nls.localize('theia/analytics/routes', 'Configure the topic patterns delivered to each analytics sink.')
        }
    }
};

export const AnalyticsPreferenceContribution = Symbol('AnalyticsPreferenceContribution');
export const AnalyticsPreferences = Symbol('AnalyticsPreferences');
export type AnalyticsPreferences = PreferenceProxy<AnalyticsConfiguration>;

export function createAnalyticsPreferences(preferences: PreferenceService, schema: PreferenceSchema = AnalyticsPreferenceSchema): AnalyticsPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindAnalyticsPreferences(bind: interfaces.Bind): void {
    bind(AnalyticsPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(AnalyticsPreferenceContribution);
        return createAnalyticsPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(AnalyticsPreferenceContribution).toConstantValue({ schema: AnalyticsPreferenceSchema });
    bind(PreferenceContribution).toService(AnalyticsPreferenceContribution);
}
