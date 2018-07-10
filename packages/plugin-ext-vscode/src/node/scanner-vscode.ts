/*
 * Copyright (C) 2015-2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { injectable } from 'inversify';
import { PluginScanner, PluginEngine, PluginPackage, PluginModel, PluginLifecycle } from '@theia/plugin-ext';

@injectable()
export class VsCodePluginScanner implements PluginScanner {
    private readonly _apiType: PluginEngine = 'vscode';

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
                backend: plugin.main
            }
        };
    }

    getLifecycle(plugin: PluginPackage): PluginLifecycle {
        return {
            startMethod: 'activate',
            stopMethod: 'deactivate',

            backendInitPath: __dirname + '/plugin-vscode-init.js'
        };
    }
}
