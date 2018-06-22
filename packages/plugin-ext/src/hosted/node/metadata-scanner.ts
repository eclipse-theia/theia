/********************************************************************************
 * Copyright (C) 2015-2018 Red Hat, Inc.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, multiInject } from 'inversify';
import { PluginPackage, PluginScanner, PluginMetadata } from '../../common/plugin-protocol';

@injectable()
export class MetadataScanner {
    private scanners: Map<string, PluginScanner> = new Map();

    constructor(
        @multiInject(PluginScanner) scanners: PluginScanner[]
    ) {
        scanners.forEach((scanner: PluginScanner) => {
            this.scanners.set(scanner.apiType, scanner);
        });
    }

    public getPluginMetadata(plugin: PluginPackage): PluginMetadata {
        const scanner = this.getScanner(plugin);
        return {
            source: plugin,
            model: scanner.getModel(plugin),
            lifecycle: scanner.getLifecycle(plugin)
        };
    }

    /**
     * Returns the first suitable scanner.
     *
     * @param {PluginPackage} plugin
     * @returns {PluginScanner}
     */
    private getScanner(plugin: PluginPackage): PluginScanner {
        let scanner;
        if (plugin && plugin.engines) {
            const scanners = Object.keys(plugin.engines)
                .filter((engineName: string) => this.scanners.has(engineName))
                .map((engineName: string) => this.scanners.get(engineName));

            // get the first suitable scanner from the list
            scanner = scanners[0];
        }

        if (!scanner) {
            throw new Error('There is no suitable scanner found for ' + plugin.name);
        }

        return scanner;
    }
}
