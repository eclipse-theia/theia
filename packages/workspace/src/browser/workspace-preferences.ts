// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceSchema,
    PreferenceContribution
} from '@theia/core/lib/browser/preferences';
import { nls } from '@theia/core/lib/common/nls';

export const workspacePreferenceSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'workspace.preserveWindow': {
            description: nls.localize('theia/workspace/preserveWindow', 'Enable opening workspaces in current window.'),
            type: 'boolean',
            default: false
        },
    }
};

export interface WorkspaceConfiguration {
    'workspace.preserveWindow': boolean,
}

export const WorkspacePreferenceContribution = Symbol('WorkspacePreferenceContribution');
export const WorkspacePreferences = Symbol('WorkspacePreferences');
export type WorkspacePreferences = PreferenceProxy<WorkspaceConfiguration>;

export function createWorkspacePreferences(preferences: PreferenceService, schema: PreferenceSchema = workspacePreferenceSchema): WorkspacePreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindWorkspacePreferences(bind: interfaces.Bind): void {
    bind(WorkspacePreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(WorkspacePreferenceContribution);
        return createWorkspacePreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(WorkspacePreferenceContribution).toConstantValue({ schema: workspacePreferenceSchema });
    bind(PreferenceContribution).toService(WorkspacePreferenceContribution);
}
