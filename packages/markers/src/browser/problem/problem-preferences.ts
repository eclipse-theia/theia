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
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';

export const ProblemConfigSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'problems.decorations.enabled': {
            'type': 'boolean',
            'description': nls.localizeByDefault('Show Errors & Warnings on files and folder. Overwritten by `#problems.visibility#` when it is off.'),
            'default': true,
        },
        'problems.decorations.tabbar.enabled': {
            'type': 'boolean',
            'description': nls.localize('theia/markers/tabbarDecorationsEnabled', 'Show problem decorators (diagnostic markers) in the tab bars.'),
            'default': true
        },
        'problems.autoReveal': {
            'type': 'boolean',
            'description': nls.localizeByDefault('Controls whether Problems view should automatically reveal files when opening them.'),
            'default': true
        }
    }
};

export interface ProblemConfiguration {
    'problems.decorations.enabled': boolean,
    'problems.decorations.tabbar.enabled': boolean,
    'problems.autoReveal': boolean
}

export const ProblemPreferenceContribution = Symbol('ProblemPreferenceContribution');
export const ProblemPreferences = Symbol('ProblemPreferences');
export type ProblemPreferences = PreferenceProxy<ProblemConfiguration>;

export function createProblemPreferences(preferences: PreferenceService, schema: PreferenceSchema = ProblemConfigSchema): ProblemPreferences {
    return createPreferenceProxy(preferences, schema);
}

export const bindProblemPreferences = (bind: interfaces.Bind): void => {
    bind(ProblemPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(ProblemPreferenceContribution);
        return createProblemPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(ProblemPreferenceContribution).toConstantValue({ schema: ProblemConfigSchema });
    bind(PreferenceContribution).toService(ProblemPreferenceContribution);
};
