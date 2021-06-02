/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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
    PreferenceSchema,
    PreferenceContribution
} from '@theia/core/lib/browser/preferences';

export const workspacePreferenceSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'workspace.preserveWindow': {
            description: 'Enable opening workspaces in current window.',
            type: 'boolean',
            default: false
        },
        'workspace.supportMultiRootWorkspace': {
            description: 'Controls whether multi-root workspace support is enabled.',
            type: 'boolean',
            default: true
        }
    }
};

export interface WorkspaceConfiguration {
    'workspace.preserveWindow': boolean,
    'workspace.supportMultiRootWorkspace': boolean
}

export const WorkspacePreferences = Symbol('WorkspacePreferences');
export type WorkspacePreferences = PreferenceProxy<WorkspaceConfiguration>;

export function createWorkspacePreferences(preferences: PreferenceService): WorkspacePreferences {
    return createPreferenceProxy(preferences, workspacePreferenceSchema);
}

export function bindWorkspacePreferences(bind: interfaces.Bind): void {
    bind(WorkspacePreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createWorkspacePreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: workspacePreferenceSchema });
}
