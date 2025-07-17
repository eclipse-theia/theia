// *****************************************************************************
// Copyright (C) 2019 Ericsson and others.
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
import { PreferenceConfiguration } from '@theia/core/lib/common/preferences/preference-configurations';
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';

export const taskSchemaId = 'vscode://schemas/tasks';

export const taskPreferencesSchema: PreferenceSchema = {
    scope: PreferenceScope.Folder,
    properties: {
        tasks: {
            $ref: taskSchemaId,
            description: 'Task definition file',
            default: {
                version: '2.0.0',
                tasks: []
            }
        }
    }
};

export function bindTaskPreferences(bind: interfaces.Bind): void {
    bind(PreferenceContribution).toConstantValue({ schema: taskPreferencesSchema });
    bind(PreferenceConfiguration).toConstantValue({ name: 'tasks' });
}
