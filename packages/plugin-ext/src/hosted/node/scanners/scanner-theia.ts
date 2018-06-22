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

import { injectable } from 'inversify';
import {
    PluginEngine,
    PluginModel,
    PluginPackage,
    PluginScanner,
    PluginLifecycle,
    buildFrontendModuleName
} from '../../../common/plugin-protocol';

@injectable()
export class TheiaPluginScanner implements PluginScanner {
    private readonly _apiType: PluginEngine = 'theiaPlugin';

    get apiType(): PluginEngine {
        return this._apiType;
    }

    getModel(plugin: PluginPackage): PluginModel {
        return {
            name: plugin.name,
            publisher: plugin.publisher,
            version: plugin.version,
            displayName: plugin.displayName,
            description: plugin.description,
            engine: {
                type: this._apiType,
                version: plugin.engines[this._apiType]
            },
            entryPoint: {
                frontend: plugin.theiaPlugin!.frontend,
                backend: plugin.theiaPlugin!.backend
            }
        };
    }

    getLifecycle(plugin: PluginPackage): PluginLifecycle {
        return {
            startMethod: 'start',
            stopMethod: 'stop',
            frontendModuleName: buildFrontendModuleName(plugin),

            backendInitPath: __dirname + '/backend-init-theia.js'
        };
    }
}
