// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { PreferenceSchema, PreferenceScope, nls, PreferenceContribution, PreferenceConfiguration, PreferenceService, createPreferenceProxy } from '@theia/core';
import { interfaces } from '@theia/core/shared/inversify';

export const extensionsSchemaID = 'vscode://schemas/extensions';
export interface RecommendedExtensions {
    recommendations?: string[];
    unwantedRecommendations?: string[];
}

export const recommendedExtensionsPreferencesSchema: PreferenceSchema = {
    scope: PreferenceScope.Folder,
    properties: {
        extensions: {
            $ref: extensionsSchemaID,
            description: nls.localize('theia/vsx-registry/recommendedExtensions', 'A list of the names of extensions recommended for use in this workspace.'),
            default: { recommendations: [] },
        },
    },
};

export const IGNORE_RECOMMENDATIONS_ID = 'extensions.ignoreRecommendations';

export const recommendedExtensionNotificationPreferencesSchema: PreferenceSchema = {
    scope: PreferenceScope.Folder,
    properties: {
        [IGNORE_RECOMMENDATIONS_ID]: {
            description: nls.localize('theia/vsx-registry/showRecommendedExtensions', 'Controls whether notifications are shown for extension recommendations.'),
            default: false,
            type: 'boolean'
        }
    }
};

export const ExtensionNotificationPreferences = Symbol('ExtensionNotificationPreferences');

export function bindExtensionPreferences(bind: interfaces.Bind): void {
    bind(PreferenceContribution).toConstantValue({ schema: recommendedExtensionsPreferencesSchema });
    bind(PreferenceConfiguration).toConstantValue({ name: 'extensions' });

    bind(ExtensionNotificationPreferences).toDynamicValue(({ container }) => {
        const preferenceService = container.get<PreferenceService>(PreferenceService);
        return createPreferenceProxy(preferenceService, recommendedExtensionNotificationPreferencesSchema);
    }).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({ schema: recommendedExtensionNotificationPreferencesSchema });
}
