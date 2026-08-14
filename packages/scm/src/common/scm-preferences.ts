// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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
    PreferenceContribution,
    PreferenceProxy,
    PreferenceSchema,
    PreferenceService,
} from '@theia/core/lib/common/preferences';
import { nls } from '@theia/core/lib/common/nls';

export const scmPreferenceSchema: PreferenceSchema = {
    properties: {
        'scm.defaultViewMode': {
            type: 'string',
            enum: ['tree', 'list'],
            enumDescriptions: [
                nls.localizeByDefault('Show the repository changes as a tree.'),
                nls.localizeByDefault('Show the repository changes as a list.')
            ],
            description: nls.localizeByDefault('Controls the default Source Control repository view mode.'),
            default: 'list'
        },
        'scm.graph.badges': {
            type: 'string',
            enum: ['all', 'filter'],
            enumDescriptions: [
                nls.localizeByDefault('Show badges of all history item groups in the Source Control Graph view.'),
                nls.localizeByDefault('Show only the badges of history item groups used as a filter in the Source Control Graph view.')
            ],
            description: nls.localizeByDefault(
                // eslint-disable-next-line max-len
                'Controls which badges are shown in the Source Control Graph view. The badges are shown on the right side of the graph indicating the names of history item groups.'),
            default: 'filter'
        },
        'scm.graph.pageOnScroll': {
            type: 'boolean',
            description: nls.localizeByDefault('Controls whether the Source Control Graph view will load the next page of items when you scroll to the end of the list.'),
            default: true
        },
        'scm.graph.pageSize': {
            type: 'number',
            minimum: 1,
            maximum: 1000,
            description: nls.localizeByDefault('The number of items to show in the Source Control Graph view by default and when loading more items.'),
            default: 50
        }
    }
};

export interface ScmConfiguration {
    'scm.defaultViewMode': 'tree' | 'list'
    'scm.graph.badges': 'all' | 'filter'
    'scm.graph.pageOnScroll': boolean
    'scm.graph.pageSize': number
}

export const ScmPreferenceContribution = Symbol('ScmPreferenceContribution');
export const ScmPreferences = Symbol('ScmPreferences');
export type ScmPreferences = PreferenceProxy<ScmConfiguration>;

export function createScmPreferences(preferences: PreferenceService, schema: PreferenceSchema = scmPreferenceSchema): ScmPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindScmPreferences(bind: interfaces.Bind): void {
    bind(ScmPreferences).toDynamicValue((ctx: interfaces.Context) => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(ScmPreferenceContribution);
        return createScmPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(ScmPreferenceContribution).toConstantValue({ schema: scmPreferenceSchema });
    bind(PreferenceContribution).toService(ScmPreferenceContribution);
}
