// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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
import { nls } from '@theia/core/lib/common/nls';
import { PreferenceConfiguration, PreferenceContribution, PreferenceSchema, PreferenceScope } from '@theia/core/lib/common';

export const launchSchemaId = 'vscode://schemas/launch';

export const launchPreferencesSchema: PreferenceSchema = {
    scope: PreferenceScope.Folder,
    properties: {
        'launch': {
            $ref: launchSchemaId,
            description: nls.localizeByDefault("Global debug launch configuration. Should be used as an alternative to 'launch.json' that is shared across workspaces."),
            default: { configurations: [], compounds: [] }
        }
    }
};

export function bindLaunchPreferences(bind: interfaces.Bind): void {
    bind(PreferenceContribution).toConstantValue({ schema: launchPreferencesSchema });
    bind(PreferenceConfiguration).toConstantValue({ name: 'launch' });
}
