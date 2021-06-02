/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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
import { taskSchemaId } from './task-schema-updater';
import { PreferenceConfiguration } from '@theia/core/lib/browser/preferences/preference-configurations';

export const taskPreferencesSchema: PreferenceSchema = {
    type: 'object',
    scope: 'resource',
    properties: {
        tasks: {
            $ref: taskSchemaId,
            description: 'Task definition file',
            defaultValue: {
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
