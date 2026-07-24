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

export const TELEMETRY_LEVEL = 'telemetry.level';
export const TELEMETRY_FILTERS = 'telemetry.filters';

export type TelemetryFilters = Record<string, string[]>;

export interface TelemetryConfiguration {
    [TELEMETRY_LEVEL]: 'off' | 'crash' | 'error' | 'all';
    [TELEMETRY_FILTERS]: TelemetryFilters;
}

export const TelemetryPreferenceSchema: PreferenceSchema = {
    scope: PreferenceScope.User,
    properties: {
        [TELEMETRY_LEVEL]: {
            type: 'string',
            enum: ['off', 'crash', 'error', 'all'],
            default: 'off',
            description: nls.localize('theia/telemetry/level', 'Controls the level of telemetry sent to remote destinations.')
        },
        [TELEMETRY_FILTERS]: {
            type: 'object',
            additionalProperties: {
                type: 'array',
                items: {
                    type: 'string'
                }
            },
            default: {},
            description: nls.localize('theia/telemetry/filters',
                'Restrict the topic patterns delivered to each telemetry sink. Missing entries allow all sink interests; empty arrays disable a sink.')
        }
    }
};

export const TelemetryPreferenceContribution = Symbol('TelemetryPreferenceContribution');
export const TelemetryPreferences = Symbol('TelemetryPreferences');
export type TelemetryPreferences = PreferenceProxy<TelemetryConfiguration>;

export function createTelemetryPreferences(preferences: PreferenceService, schema: PreferenceSchema = TelemetryPreferenceSchema): TelemetryPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindTelemetryPreferences(bind: interfaces.Bind): void {
    bind(TelemetryPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(TelemetryPreferenceContribution);
        return createTelemetryPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(TelemetryPreferenceContribution).toConstantValue({ schema: TelemetryPreferenceSchema });
    bind(PreferenceContribution).toService(TelemetryPreferenceContribution);
}
