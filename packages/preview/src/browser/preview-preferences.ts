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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from '@theia/core/shared/inversify';
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceContribution,
    PreferenceSchema
} from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';

export const PreviewConfigSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'preview.openByDefault': {
            type: 'boolean',
            description: nls.localize('theia/preview/openByDefault', 'Open the preview instead of the editor by default.'),
            default: false
        }
    }
};

export interface PreviewConfiguration {
    'preview.openByDefault': boolean;
}

export const PreviewPreferenceContribution = Symbol('PreviewPreferenceContribution');
export const PreviewPreferences = Symbol('PreviewPreferences');
export type PreviewPreferences = PreferenceProxy<PreviewConfiguration>;

export function createPreviewPreferences(preferences: PreferenceService, schema: PreferenceSchema = PreviewConfigSchema): PreviewPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindPreviewPreferences(bind: interfaces.Bind): void {
    bind(PreviewPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(PreviewPreferenceContribution);
        return createPreviewPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(PreviewPreferenceContribution).toConstantValue({ schema: PreviewConfigSchema });
    bind(PreferenceContribution).toService(PreviewPreferenceContribution);
}
