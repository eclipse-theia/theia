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

/* tslint:disable:no-any */

import { Emitter, Event } from '@theia/core/lib/common/event';
import * as theia from '@theia/plugin';
import {
    PLUGIN_RPC_CONTEXT,
    PreferenceRegistryExt,
    PreferenceRegistryMain,
    PreferenceData,
    PreferenceChangeExt
} from '../api/plugin-api';
import { RPCProtocol } from '../api/rpc-protocol';
import { isObject, mixin } from '../common/types';
import { Configuration, ConfigurationModel } from './preferences/configuration';
import { WorkspaceExtImpl } from './workspace';
import cloneDeep = require('lodash.clonedeep');

enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3
}

enum PreferenceScope {
    Default,
    User,
    Workspace,
    Folder,
}

interface ConfigurationInspect<T> {
    key: string;
    defaultValue?: T;
    globalValue?: T;
    workspaceValue?: T;
    workspaceFolderValue?: T;
}

// tslint:disable-next-line:no-any
function lookUp(tree: any, key: string): any {
    if (!key) {
        return;
    }

    const parts = key.split('.');
    let node = tree;
    for (let i = 0; node && i < parts.length; i++) {
        node = node[parts[i]];
    }
    return node;
}

export class PreferenceRegistryExtImpl implements PreferenceRegistryExt {
    private proxy: PreferenceRegistryMain;
    private _preferences: Configuration;
    private readonly _onDidChangeConfiguration = new Emitter<theia.ConfigurationChangeEvent>();

    readonly onDidChangeConfiguration: Event<theia.ConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

    constructor(
        rpc: RPCProtocol,
        private readonly workspace: WorkspaceExtImpl
    ) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.PREFERENCE_REGISTRY_MAIN);
    }

    init(data: PreferenceData): void {
        data[PreferenceScope.Default]['files.associations'] = {};
        this._preferences = this.parse(data);
    }

    $acceptConfigurationChanged(data: PreferenceData, eventData: PreferenceChangeExt): void {
        this.init(data);
        this._onDidChangeConfiguration.fire(this.toConfigurationChangeEvent(eventData));
    }

    getConfiguration(section?: string, resource?: theia.Uri | null, extensionId?: string): theia.WorkspaceConfiguration {
        resource = resource === null ? undefined : resource;
        const preferences = this.toReadonlyValue(section
            ? lookUp(this._preferences.getValue(undefined, this.workspace, resource), section)
            : this._preferences.getValue(undefined, this.workspace, resource));

        const configuration: theia.WorkspaceConfiguration = {
            has(key: string): boolean {
                return typeof lookUp(preferences, key) !== 'undefined';
            },
            get: <T>(key: string, defaultValue?: T) => {
                const result = lookUp(preferences, key);
                if (typeof result === 'undefined') {
                    return defaultValue;
                } else {
                    let clonedConfig: any = undefined;
                    const cloneOnWriteProxy = (target: any, accessor: string): any => {
                        let clonedTarget: any = undefined;
                        const cloneTarget = () => {
                            clonedConfig = clonedConfig ? clonedConfig : cloneDeep(preferences);
                            clonedTarget = clonedTarget ? cloneTarget : lookUp(clonedConfig, accessor);
                        };

                        if (!isObject(target)) {
                            return target;
                        }
                        return new Proxy(target, {
                            get: (targ: any, prop: string) => {
                                if (typeof prop === 'string' && prop.toLowerCase() === 'tojson') {
                                    cloneTarget();
                                    return () => clonedTarget;
                                }
                                if (clonedConfig) {
                                    clonedTarget = cloneTarget ? cloneTarget : lookUp(clonedConfig, accessor);
                                    return clonedTarget[prop];
                                }
                                const res = targ[prop];
                                if (typeof prop === 'string') {
                                    return cloneOnWriteProxy(res, `${accessor}.${prop}`);
                                }
                                return res;
                            },
                            set: (targ: any, prop: string, val: any) => {
                                cloneTarget();
                                clonedTarget[prop] = val;
                                return true;
                            },
                            deleteProperty: (targ: any, prop: string) => {
                                cloneTarget();
                                delete clonedTarget[prop];
                                return true;
                            },
                            defineProperty: (targ: any, prop: string, descr: any) => {
                                cloneTarget();
                                Object.defineProperty(clonedTarget, prop, descr);
                                return true;
                            }
                        });
                    };
                    return cloneOnWriteProxy(result, key);
                }
            },
            update: (key: string, value: any, arg?: ConfigurationTarget | boolean): PromiseLike<void> => {
                key = section ? `${section}.${key}` : key;
                const resourceStr: string | undefined = resource ? resource.toString() : undefined;
                if (typeof value !== 'undefined') {
                    return this.proxy.$updateConfigurationOption(arg, key, value, resourceStr);
                } else {
                    return this.proxy.$removeConfigurationOption(arg, key, resourceStr);
                }
            },
            inspect: <T>(key: string): ConfigurationInspect<T> => {
                key = section ? `${section}.${key}` : key;
                resource = resource === null ? undefined : resource;
                const result = cloneDeep(this._preferences.inspect<T>(key, this.workspace, resource));

                if (!result) {
                    return undefined!;
                }

                const configInspect: ConfigurationInspect<T> = { key };
                if (result.default) {
                    configInspect.defaultValue = result.default;
                }
                if (result.user) {
                    configInspect.globalValue = result.user;
                }
                if (result.workspace) {
                    configInspect.workspaceValue = result.workspace;
                }
                if (result.workspaceFolder) {
                    configInspect.workspaceFolderValue = result.workspaceFolder;
                }
                return configInspect;
            }
        };

        if (typeof preferences === 'object') {
            mixin(configuration, preferences, false);
        }

        return Object.freeze(configuration);
    }

    private toReadonlyValue(data: any): any {
        const readonlyProxy = (target: any): any => isObject(target)
            ? new Proxy(target, {
                get: (targ: any, prop: string) => readonlyProxy(targ[prop]),
                set: (targ: any, prop: string, val: any) => {
                    throw new Error(`TypeError: Cannot assign to read only property '${prop}' of object`);
                },
                deleteProperty: (targ: any, prop: string) => {
                    throw new Error(`TypeError: Cannot delete read only property '${prop}' of object`);
                },
                defineProperty: (targ: any, prop: string) => {
                    throw new Error(`TypeError: Cannot define property '${prop}' of a readonly object`);
                },
                setPrototypeOf: (targ: any) => {
                    throw new Error('TypeError: Cannot set prototype for a readonly object');
                },
                isExtensible: () => false,
                preventExtensions: () => true
            })
            : target;
        return readonlyProxy(data);
    }

    private parse(data: PreferenceData): Configuration {
        const defaultConfiguration = this.getConfigurationModel(data[PreferenceScope.Default]);
        const userConfiguration = this.getConfigurationModel(data[PreferenceScope.User]);
        const workspaceConfiguration = this.getConfigurationModel(data[PreferenceScope.Workspace]);
        const folderConfigurations = {} as { [resource: string]: ConfigurationModel };
        Object.keys(data[PreferenceScope.Folder]).forEach(resource => {
            folderConfigurations[resource] = this.getConfigurationModel(data[PreferenceScope.Folder][resource]);
        });
        return new Configuration(defaultConfiguration, userConfiguration, workspaceConfiguration, folderConfigurations);
    }

    private getConfigurationModel(data: { [key: string]: any }): ConfigurationModel {
        if (!data) {
            return new ConfigurationModel();
        }
        return new ConfigurationModel(this.parseConfigurationData(data), Object.keys(data));
    }

    private parseConfigurationData(data: { [key: string]: any }): { [key: string]: any } {
        return Object.keys(data).reduce((result: any, key: string) => {
            const parts = key.split('.');
            let branch = result;
            for (let i = 0; i < parts.length; i++) {
                if (i === parts.length - 1) {
                    branch[parts[i]] = data[key];
                    continue;
                }
                if (!branch[parts[i]]) {
                    branch[parts[i]] = {};
                }
                branch = branch[parts[i]];
            }
            return result;
        }, {});
    }

    private toConfigurationChangeEvent(eventData: PreferenceChangeExt): theia.ConfigurationChangeEvent {
        return Object.freeze({
            affectsConfiguration: (section: string, uri?: theia.Uri): boolean => {
                const tree = eventData.preferenceName
                    .split('.')
                    .reverse()
                    .reduce((prevValue: any, curValue: any) => ({ [curValue]: prevValue }), eventData.newValue);
                return !!lookUp(tree, section);
            }
        });
    }

}
