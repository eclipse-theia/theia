/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';

export const VSXExtensionConfigSchema: PreferenceSchema = {
    'type': 'object',
    properties: {
        'extensions.displayIncompatible': {
            type: 'boolean',
            description: 'Controls whether to display incompatible extensions when searching.',
            default: true
        }
    }
};

export interface VSXExtensionConfiguration {
    'extensions.displayIncompatible': boolean;
}

export const VSXExtensionPreferenceContribution = Symbol('VSXExtensionPreferenceContribution');
export const VSXExtensionPreferences = Symbol('VSXExtensionPreferences');
export type VSXExtensionPreferences = PreferenceProxy<VSXExtensionConfiguration>;

export function createVSXExtensionPreferences(preferences: PreferenceService, schema: PreferenceSchema = VSXExtensionConfigSchema): VSXExtensionPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindVSXExtensionPreferences(bind: interfaces.Bind): void {
    bind(VSXExtensionPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(VSXExtensionPreferenceContribution);
        return createVSXExtensionPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(VSXExtensionPreferenceContribution).toConstantValue({ schema: VSXExtensionConfigSchema });
    bind(PreferenceContribution).toService(VSXExtensionPreferenceContribution);
}
