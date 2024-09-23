// *****************************************************************************
// Copyright (C) 2021 EclipseSource and others.
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

import {
    createPreferenceProxy, PreferenceContribution, PreferenceProxy, PreferenceSchema, PreferenceScope, PreferenceService
} from '@theia/core/lib/browser/preferences';
import { nls } from '@theia/core/lib/common/nls';
import { interfaces } from '@theia/core/shared/inversify';

export const WORKSPACE_TRUST_ENABLED = 'security.workspace.trust.enabled';
export const WORKSPACE_TRUST_STARTUP_PROMPT = 'security.workspace.trust.startupPrompt';
export const WORKSPACE_TRUST_EMPTY_WINDOW = 'security.workspace.trust.emptyWindow';

export enum WorkspaceTrustPrompt {
    ALWAYS = 'always',
    ONCE = 'once',
    NEVER = 'never'
}

export const workspaceTrustPreferenceSchema: PreferenceSchema = {
    type: 'object',
    scope: PreferenceScope.User,
    properties: {
        [WORKSPACE_TRUST_ENABLED]: {
            description: nls.localize('theia/workspace/trustEnabled', 'Controls whether or not workspace trust is enabled. If disabled, all workspaces are trusted.'),
            type: 'boolean',
            defaultValue: true
        },
        [WORKSPACE_TRUST_STARTUP_PROMPT]: {
            description: nls.localizeByDefault('Controls when the startup prompt to trust a workspace is shown.'),
            enum: Object.values(WorkspaceTrustPrompt),
            defaultValue: WorkspaceTrustPrompt.ALWAYS
        },
        [WORKSPACE_TRUST_EMPTY_WINDOW]: {
            description: nls.localize('theia/workspace/trustEmptyWindow', 'Controls whether or not the empty workspace is trusted by default.'),
            type: 'boolean',
            defaultValue: true
        }
    }
};

export interface WorkspaceTrustConfiguration {
    [WORKSPACE_TRUST_ENABLED]: boolean,
    [WORKSPACE_TRUST_STARTUP_PROMPT]: WorkspaceTrustPrompt;
    [WORKSPACE_TRUST_EMPTY_WINDOW]: boolean;
}

export const WorkspaceTrustPreferenceContribution = Symbol('WorkspaceTrustPreferenceContribution');
export const WorkspaceTrustPreferences = Symbol('WorkspaceTrustPreferences');
export type WorkspaceTrustPreferences = PreferenceProxy<WorkspaceTrustConfiguration>;

export function createWorkspaceTrustPreferences(preferences: PreferenceService, schema: PreferenceSchema = workspaceTrustPreferenceSchema): WorkspaceTrustPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindWorkspaceTrustPreferences(bind: interfaces.Bind): void {
    bind(WorkspaceTrustPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(WorkspaceTrustPreferenceContribution);
        return createWorkspaceTrustPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(WorkspaceTrustPreferenceContribution).toConstantValue({ schema: workspaceTrustPreferenceSchema });
    bind(PreferenceContribution).toService(WorkspaceTrustPreferenceContribution);
}
