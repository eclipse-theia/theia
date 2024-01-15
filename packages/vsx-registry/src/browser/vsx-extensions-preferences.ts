// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
    PreferenceSchema,
    PreferenceContribution
} from '@theia/core/lib/browser/preferences';
import { nls } from '@theia/core';

export const VsxExtensionsPreferenceSchema: PreferenceSchema = {
    'type': 'object',
    properties: {
        'extensions.onlyShowVerifiedExtensions': {
            type: 'boolean',
            default: false,
            description: nls.localize('theia/vsx-registry/onlyShowVerifiedExtensionsDescription', 'This allows the {0} to only show verified extensions.', 'Open VSX Registry')
        },
    }
};

export interface VsxExtensionsConfiguration {
    'extensions.onlyShowVerifiedExtensions': boolean;
}

export const VsxExtensionsPreferenceContribution = Symbol('VsxExtensionsPreferenceContribution');
export const VsxExtensionsPreferences = Symbol('VsxExtensionsPreferences');
export type VsxExtensionsPreferences = PreferenceProxy<VsxExtensionsConfiguration>;

export function createVsxExtensionsPreferences(preferences: PreferenceService, schema: PreferenceSchema = VsxExtensionsPreferenceSchema): VsxExtensionsPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindVsxExtensionsPreferences(bind: interfaces.Bind): void {
    bind(VsxExtensionsPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(VsxExtensionsPreferenceContribution);
        return createVsxExtensionsPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(VsxExtensionsPreferenceContribution).toConstantValue({ schema: VsxExtensionsPreferenceSchema });
    bind(PreferenceContribution).toService(VsxExtensionsPreferenceContribution);
}
