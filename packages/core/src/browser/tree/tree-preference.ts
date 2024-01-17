// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
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

import { interfaces } from 'inversify';
import { PreferenceProxy, PreferenceContribution, PreferenceSchema } from '../preferences';
import { PreferenceProxyFactory } from '../preferences/injectable-preference-proxy';
import { nls } from '../../common/nls';

export const PREFERENCE_NAME_TREE_INDENT = 'workbench.tree.indent';

export const treePreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [PREFERENCE_NAME_TREE_INDENT]: {
            description: nls.localizeByDefault('Controls tree indentation in pixels.'),
            type: 'number',
            default: 8,
            minimum: 4,
            maximum: 40
        },
    }
};

export class TreeConfiguration {
    [PREFERENCE_NAME_TREE_INDENT]: number;
}

export const TreePreferences = Symbol('treePreferences');
export type TreePreferences = PreferenceProxy<TreeConfiguration>;

export function bindTreePreferences(bind: interfaces.Bind): void {
    bind(TreePreferences).toDynamicValue(ctx => {
        const factory = ctx.container.get<PreferenceProxyFactory>(PreferenceProxyFactory);
        return factory(treePreferencesSchema);
    }).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({ schema: treePreferencesSchema });
}
