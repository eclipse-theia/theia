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
} from '@theia/core/lib/browser';

export const PreviewConfigSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'preview.openByDefault': {
            type: 'boolean',
            description: 'Open the preview instead of the editor by default.',
            default: false
        }
    }
};

export interface PreviewConfiguration {
    'preview.openByDefault': boolean;
}

export const PreviewPreferences = Symbol('PreviewPreferences');
export type PreviewPreferences = PreferenceProxy<PreviewConfiguration>;

export function createPreviewPreferences(
    preferences: PreferenceService
): PreviewPreferences {
    return createPreferenceProxy(preferences, PreviewConfigSchema);
}

export function bindPreviewPreferences(bind: interfaces.Bind): void {
    bind(PreviewPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createPreviewPreferences(preferences);
    });
    bind(PreferenceContribution).toConstantValue({ schema: PreviewConfigSchema });
}
