// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
    PreferenceContribution,
    PreferenceProxy,
    PreferenceSchema,
    PreferenceService,
    createPreferenceProxy
} from '@theia/core/lib/browser/preferences';
import { nls } from '@theia/core/lib/common/nls';

export const OutputConfigSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'output.maxChannelHistory': {
            'type': 'number',
            'description': nls.localize('theia/output/maxChannelHistory', 'The maximum number of entries in an output channel.'),
            'default': 1000
        }
    }
};

export interface OutputConfiguration {
    'output.maxChannelHistory': number
}

export const OutputPreferenceContribution = Symbol('OutputPreferenceContribution');
export const OutputPreferences = Symbol('OutputPreferences');
export type OutputPreferences = PreferenceProxy<OutputConfiguration>;

export function createOutputPreferences(preferences: PreferenceService, schema: PreferenceSchema = OutputConfigSchema): OutputPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindOutputPreferences(bind: interfaces.Bind): void {
    bind(OutputPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(OutputPreferenceContribution);
        return createOutputPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(OutputPreferenceContribution).toConstantValue({ schema: OutputConfigSchema });
    bind(PreferenceContribution).toService(OutputPreferenceContribution);
}
