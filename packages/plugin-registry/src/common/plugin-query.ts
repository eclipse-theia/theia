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

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { interfaces } from '@theia/core/shared/inversify';

/**
 * Represents a plugin query as inputed in the default UI.
 */
export interface PluginQuery {
    /**
     * String query without the modifiers.
     */
    query: string
    /**
     * Original string query including the modifiers.
     */
    fullQuery: string
    /**
     * Extracted modifiers from the query.
     */
    modifiers: {
        /**
         * Renderers should ignore this field.
         *
         * Providers handling the query must assume that the returned plugins
         * should match _all_ modifiers from this list. If one of the modifiers is
         * unknown then the provider should return an empty list of plugins.
         */
        filtering: any[]
        /**
         * Providers should ignore this field.
         *
         * Renderers should take the order into account.
         */
        sorting: any[]
    }
}

export const PluginQueryParser = Symbol('PluginQueryParser') as symbol & interfaces.Abstract<PluginQueryParser>;
export interface PluginQueryParser {
    parsePluginQuery(query: string): PluginQuery;
}

export const PluginQueryModifier = Symbol('PluginQueryModifier') as symbol & interfaces.Abstract<PluginQueryModifier>;
export interface PluginQueryModifier {
    extractPluginQueryModifier(query: PluginQuery): void;
}
