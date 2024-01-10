// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { nls } from '@theia/core/lib/common/nls';

export const GettingStartedPreferenceSchema: PreferenceSchema = {
    'type': 'object',
    properties: {
        'workbench.startupEditor': {
            type: 'string',
            enum: ['none', 'welcomePage', 'readme', 'newUntitledFile', 'welcomePageInEmptyWorkbench'],
            enumDescriptions: [
                nls.localizeByDefault('Start without an editor.'),
                nls.localize('theia/getting-started/startup-editor/welcomePage', 'Open the Welcome page, with content to aid in getting started with {0} and extensions.',
                    FrontendApplicationConfigProvider.get().applicationName),
                // eslint-disable-next-line max-len
                nls.localizeByDefault("Open the README when opening a folder that contains one, fallback to 'welcomePage' otherwise. Note: This is only observed as a global configuration, it will be ignored if set in a workspace or folder configuration."),
                nls.localizeByDefault('Open a new untitled text file (only applies when opening an empty window).'),
                nls.localizeByDefault('Open the Welcome page when opening an empty workbench.'),
            ],
            default: 'welcomePage',
            description: nls.localizeByDefault('Controls which editor is shown at startup, if none are restored from the previous session.')
        },
    }
};

export interface GettingStartedConfiguration {
    'workbench.startupEditor': string;
}

export const GettingStartedPreferenceContribution = Symbol('GettingStartedPreferenceContribution');
export const GettingStartedPreferences = Symbol('GettingStartedPreferences');
export type GettingStartedPreferences = PreferenceProxy<GettingStartedConfiguration>;

export function createGettingStartedPreferences(preferences: PreferenceService, schema: PreferenceSchema = GettingStartedPreferenceSchema): GettingStartedPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindGettingStartedPreferences(bind: interfaces.Bind): void {
    bind(GettingStartedPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(GettingStartedPreferenceContribution);
        return createGettingStartedPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(GettingStartedPreferenceContribution).toConstantValue({ schema: GettingStartedPreferenceSchema });
    bind(PreferenceContribution).toService(GettingStartedPreferenceContribution);
}
