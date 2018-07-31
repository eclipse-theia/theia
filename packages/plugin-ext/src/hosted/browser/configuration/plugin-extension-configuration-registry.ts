/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { injectable, inject } from 'inversify';
import { Emitter, DisposableCollection, ILogger } from '@theia/core/lib/common';
import * as types from '../configuration/types';
import { PluginConfigurationProvider } from '../plugin-configuration';
import { PreferenceSchemaProvider } from '@theia/core/lib/browser';

@injectable()
export class ExtensionsAndPluginsConfigurationRegistry {

    protected readonly toDispose = new DisposableCollection();
    protected readonly onConfigurationRegisteredEmitter = new Emitter<string[]>();
    readonly onConfigurationChanged = this.onConfigurationRegisteredEmitter.event;

    private prefMap: Map<String, any> = new Map();

    constructor(
        @inject(PluginConfigurationProvider) private pluginConfProvider: PluginConfigurationProvider,
        @inject(ILogger) private readonly logger: ILogger,
        @inject(PreferenceSchemaProvider) private readonly prefChemaProvider: PreferenceSchemaProvider,
    ) {
        console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');

        const extensionProperties = this.prefChemaProvider.getSchema().properties;
        Object.keys(extensionProperties).forEach(prefName => {
            const value = extensionProperties[prefName];
            this.registerProperty(prefName, value);
        });

        this.pluginConfProvider.onPluginConfigurationChanged(pluginPref => {
            const confChanges: string[] = [];

            Object.keys(pluginPref.properties).forEach(prefName => {
                const value = pluginPref.properties[prefName];
                const confChange = this.registerProperty(prefName, value);
                if (confChange) {
                    confChanges.push(confChange);
                }
            });

            if (confChanges.length > 0) {
                this.onConfigurationRegisteredEmitter.fire(confChanges);
                console.log("conf changes !!! ", confChanges);
            }
        });
    }

    // todo validate more deeply...
    private validatePrefName(prefKey: string): boolean {
        return !this.prefMap.has(prefKey);
    }

    private registerProperty(prefName: string, value: any): string | undefined {
        if (this.validatePrefName(prefName)) {
            value.default = types.isUndefined(value.default) ? this.getDefaultValue(value.type) : value.default;
            this.prefMap.set(prefName, value);

            return prefName;
        } else {
            this.logger.warn(`Configuration key: is already registered ${prefName}`);
        }

        return undefined;
    }

    private getDefaultValue(type: string): any {
        switch (type) {
            case 'boolean':
                return false;
            case 'integer':
            case 'number':
                return 0;
            case 'string':
                return '';
            case 'array':
                return [];
            case 'object':
                return {};
            default:
                return null;
        }
    }

    getConfigurationProperties(): any {
        const confProps: any = {};
        this.prefMap.forEach((value, key: string) => {
            confProps[key] = value;
        });
        // todo freeze...
        return confProps;
    }
}
