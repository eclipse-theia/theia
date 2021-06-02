/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceContribution,
    PreferenceSchema
} from '@theia/core/lib/browser/preferences';

export const OutputConfigSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'output.maxChannelHistory': {
            'type': 'number',
            'description': 'The maximum number of entries in an output channel.',
            'default': 1000
        }
    }
};

export interface OutputConfiguration {
    'output.maxChannelHistory': number
}

export const OutputPreferences = Symbol('OutputPreferences');
export type OutputPreferences = PreferenceProxy<OutputConfiguration>;

export function createOutputPreferences(preferences: PreferenceService): OutputPreferences {
    return createPreferenceProxy(preferences, OutputConfigSchema);
}

export function bindOutputPreferences(bind: interfaces.Bind): void {
    bind(OutputPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createOutputPreferences(preferences);
    });

    bind(PreferenceContribution).toConstantValue({ schema: OutputConfigSchema });
}
