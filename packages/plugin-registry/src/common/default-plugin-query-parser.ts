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

import { ContributionProvider } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { PluginQuery, PluginQueryModifier, PluginQueryParser } from './plugin-query';

@injectable()
export class DefaultPluginQueryParser implements PluginQueryParser {

    @inject(ContributionProvider) @named(PluginQueryModifier)
    protected queryModifiers: ContributionProvider<PluginQueryModifier>;

    parsePluginQuery(query: string): PluginQuery {
        query = query.trim();
        const queryObject: PluginQuery = { query, fullQuery: query, modifiers: { filtering: [], sorting: [] } };
        this.queryModifiers.getContributions()
            .forEach(modifier => modifier.extractPluginQueryModifier(queryObject))
        queryObject.query = queryObject.query.trim();
        return queryObject;
    }
}
