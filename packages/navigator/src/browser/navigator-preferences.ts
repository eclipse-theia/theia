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
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';

export const EXPLORER_COMPACT_FOLDERS = 'explorer.compactFolders';

export const FileNavigatorConfigSchema: PreferenceSchema = {
    'type': 'object',
    properties: {
        'explorer.autoReveal': {
            type: 'boolean',
            description: nls.localizeByDefault('Controls whether the Explorer should automatically reveal and select files when opening them.'),
            default: true
        },
        'explorer.decorations.colors': {
            type: 'boolean',
            description: nls.localizeByDefault('Controls whether file decorations should use colors.'),
            default: true
        },
        [EXPLORER_COMPACT_FOLDERS]: {
            type: 'boolean',
            // eslint-disable-next-line max-len
            description: nls.localizeByDefault('Controls whether the Explorer should render folders in a compact form. In such a form, single child folders will be compressed in a combined tree element. Useful for Java package structures, for example.'),
            default: true,
        }
    },
};

export interface FileNavigatorConfiguration {
    'explorer.autoReveal': boolean;
    'explorer.decorations.colors': boolean;
    [EXPLORER_COMPACT_FOLDERS]: boolean;
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
