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
import { nls } from '@theia/core/lib/common/nls';

export const GettingStartedPreferenceSchema: PreferenceSchema = {
    'type': 'object',
    properties: {
        'welcome.alwaysShowWelcomePage': {
            type: 'boolean',
            description: nls.localizeByDefault('Show welcome page on startup'),
            default: true
        }
    }
};

export interface GettingStartedConfiguration {
    'welcome.alwaysShowWelcomePage': boolean;
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
