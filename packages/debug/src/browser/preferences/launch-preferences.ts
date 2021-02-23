/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser/preferences/preference-contribution';
import { launchSchemaId } from '../debug-schema-updater';
import { PreferenceConfiguration } from '@theia/core/lib/browser/preferences/preference-configurations';

export const launchPreferencesSchema: PreferenceSchema = {
    type: 'object',
    scope: 'resource',
    properties: {
        'launch': {
            $ref: launchSchemaId,
            description: "Global debug launch configuration. Should be used as an alternative to 'launch.json' that is shared across workspaces",
            defaultValue: { configurations: [], compounds: [] }
        }
    }
};

export function bindLaunchPreferences(bind: interfaces.Bind): void {
    bind(PreferenceContribution).toConstantValue({ schema: launchPreferencesSchema });
    bind(PreferenceConfiguration).toConstantValue({ name: 'launch' });
}
