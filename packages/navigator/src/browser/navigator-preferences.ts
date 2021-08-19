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
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';

export const FileNavigatorConfigSchema: PreferenceSchema = {
    'type': 'object',
    properties: {
        'explorer.autoReveal': {
            type: 'boolean',
            description: 'Selects file under editing in the explorer.',
            default: true
        }
    }
};

export interface FileNavigatorConfiguration {
    'explorer.autoReveal': boolean;
}

export const FileNavigatorPreferenceContribution = Symbol('FileNavigatorPreferenceContribution');
export const FileNavigatorPreferences = Symbol('NavigatorPreferences');
export type FileNavigatorPreferences = PreferenceProxy<FileNavigatorConfiguration>;

export function createNavigatorPreferences(preferences: PreferenceService, schema: PreferenceSchema = FileNavigatorConfigSchema): FileNavigatorPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindFileNavigatorPreferences(bind: interfaces.Bind): void {
    bind(FileNavigatorPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(FileNavigatorPreferenceContribution);
        return createNavigatorPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(FileNavigatorPreferenceContribution).toConstantValue({ schema: FileNavigatorConfigSchema });
    bind(PreferenceContribution).toService(FileNavigatorPreferenceContribution);
}
