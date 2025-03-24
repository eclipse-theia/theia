/********************************************************************************
 * Copyright (C) 2024 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import * as nodePty from 'node-pty';

const overrides = [
    {
        package: 'node-pty',
        module: nodePty
    }
];

/**
 * Some plugins attempt to require some packages from VSCode's node_modules.
 * Since we don't have node_modules usually, we need to override the require function to return the expected package.
 *
 * See also:
 * https://github.com/eclipse-theia/theia/issues/14714
 * https://github.com/eclipse-theia/theia/issues/13779
 */
export function overridePluginDependencies(): void {
    const node_module = require('module');
    const original = node_module._load;
    node_module._load = function (request: string): unknown {
        try {
            // Attempt to load the original module
            // In some cases VS Code extensions will come with their own `node_modules` folder
            return original.apply(this, arguments);
        } catch (e) {
            // If the `require` call failed, attempt to load the module from the overrides
            for (const filter of overrides) {
                if (request === filter.package || request.endsWith(`node_modules/${filter.package}`) || request.endsWith(`node_modules\\${filter.package}`)) {
                    return filter.module;
                }
            }
            // If no override was found, rethrow the error
            throw e;
        }
    };
}
