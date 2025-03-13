// *****************************************************************************
// Copyright (C) 2025 Typefox GmbH and others.
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

import { PluginApiAccessExt, PluginManager } from '../common';

export class PluginApiAccessExtImpl implements PluginApiAccessExt {

    constructor(protected pluginManager: PluginManager) { }

    async $getBasicExports<T>(pluginId: string): Promise<T> {
        return JSON.parse(JSON.stringify(this.pluginManager.getPluginExport(pluginId) as T,
            (key, value) => typeof value === 'function' ? '$extension-exports-callable' : value));
    }

    async $exec(pluginId: string, propertyPath: string[], args?: unknown[]): Promise<unknown> {
        const exports = this.pluginManager.getPluginExport(pluginId) as Record<string, unknown>;
        if (!exports) {
            throw new Error(`Plugin with id ${pluginId} not found.`);
        }
        let currentProperty: Record<string, unknown> | ((...args: unknown[]) => unknown) = exports;
        for (const property of propertyPath) {
            if (typeof currentProperty !== 'object') {
                throw new Error(`Error trying to access Property ${propertyPath[propertyPath.length - 1]} on value of type ${typeof currentProperty}.`);
            }
            if (!currentProperty[property]) {
                throw new Error(`Property ${property} not found in plugin with id ${pluginId}.`);
            }
            currentProperty = currentProperty[property] as Record<string, unknown> | ((...args: unknown[]) => unknown);
        }

        if (!currentProperty || typeof currentProperty !== 'function') {
            throw new Error(`Property ${propertyPath[propertyPath.length - 1]} is not a function.`);
        }

        return await currentProperty(...(args ?? []));
    }

}
