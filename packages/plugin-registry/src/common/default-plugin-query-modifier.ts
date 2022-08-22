// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { PluginQuery, PluginQueryModifier } from './plugin-query';

export const BuiltinModifier: string = '@builtin';
export const InstalledModifier: string = '@installed';
export const RecommendedModifier: string = '@recommended';

export class DefaultPluginQueryFilteringModifier implements PluginQueryModifier {

    protected matcher: RegExp;

    /**
     * @param modifier Sub-RegExp template matching the modifier string.
     */
    constructor(
        protected modifier: string
    ) {
        this.matcher = new RegExp('(^|\s+)' + modifier + '(\s+|$)', 'g');
    }

    extractPluginQueryModifier(queryObject: PluginQuery): void {
        if (this.matcher.test(queryObject.query)) {
            queryObject.query = queryObject.query.replace(this.matcher, ' ');
            if (!queryObject.modifiers.filtering.includes(this.modifier)) {
                queryObject.modifiers.filtering.push(this.modifier);
            }
        }
    }
}

export const BuiltinPluginQueryModifier = new DefaultPluginQueryFilteringModifier(BuiltinModifier);
export const InstalledPluginQueryModifier = new DefaultPluginQueryFilteringModifier(InstalledModifier);
export const RecommendedPluginQueryModifier = new DefaultPluginQueryFilteringModifier(RecommendedModifier);
