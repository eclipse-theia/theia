// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { Emitter, Event } from '@theia/core/lib/common/event';
import { URI } from '@theia/core/shared/vscode-uri';
import { ResourceMap } from '@theia/monaco-editor-core/esm/vs/base/common/map';
import { IConfigurationOverrides, IOverrides } from '@theia/monaco-editor-core/esm/vs/platform/configuration/common/configuration';
import { Configuration, ConfigurationModel } from '@theia/monaco-editor-core/esm/vs/platform/configuration/common/configurationModels';
import { Workspace, WorkspaceFolder } from '@theia/monaco-editor-core/esm/vs/platform/workspace/common/workspace';
import * as theia from '@theia/plugin';
import { platform } from 'os';
import { v4 } from 'uuid';
import {
    PLUGIN_RPC_CONTEXT, PreferenceChangeExt, PreferenceData, PreferenceRegistryExt,
    PreferenceRegistryMain
} from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import { isObject, mixin } from '../common/types';
import { WorkspaceExtImpl } from './workspace';
import cloneDeep = require('lodash.clonedeep');

const injectionRe = /\b__proto__\b|\bconstructor\.prototype\b/;

enum ConfigurationTarget {
    Global = 1,
    Workspace = 2, // eslint-disable-line @typescript-eslint/no-shadow
    WorkspaceFolder = 3 // eslint-disable-line @typescript-eslint/no-shadow
}

export enum PreferenceScope {
    Default,
    User,
    Workspace, // eslint-disable-line @typescript-eslint/no-shadow
    Folder,
}

interface ConfigurationInspect<T> {
    key: string;
    defaultValue?: T;
    globalValue?: T;
    workspaceValue?: T;
    workspaceFolderValue?: T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export class TheiaWorkspace extends Workspace {
    constructor(ext: WorkspaceExtImpl) {
        const folders = (ext.workspaceFolders ?? []).map(folder => new WorkspaceFolder(folder));
        super(v4(), folders, false, ext.workspaceFile ?? null, () => ['win32', 'darwin'].includes(platform()));
    }
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
        this._preferences = this.parse(data);
    }

    $acceptConfigurationChanged(data: PreferenceData, eventData: PreferenceChangeExt[]): void {
        this.init(data);
        this._onDidChangeConfiguration.fire(this.toConfigurationChangeEvent(eventData));
    }

    getConfiguration(rawSection?: string, rawScope?: theia.ConfigurationScope | null, extensionId?: string): theia.WorkspaceConfiguration {
        const overrides = this.parseConfigurationAccessOptions(rawScope);

        const preferences = this.toReadonlyValue(
            this._preferences.getValue(rawSection, overrides, new TheiaWorkspace(this.workspace)));

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
                            clonedTarget = clonedTarget ? clonedTarget : lookUp(clonedConfig, accessor);
                        };

                        if (!isObject(target)) {
                            return target;
                        }
                        return new Proxy(target, {
                            get: (targ: any, prop: string) => {
                                const config = Object.getOwnPropertyDescriptor(targ, prop);
                                // This check ensures that https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/get#invariants are satisfied
                                if (config?.configurable === false && config?.writable === false) {
                                    return targ[prop];
                                }
                                if (typeof prop === 'string' && prop.toLowerCase() === 'tojson') {
                                    cloneTarget();
                                    return () => clonedTarget;
                                }
                                if (clonedConfig) {
                                    clonedTarget = clonedTarget ? clonedTarget : lookUp(clonedConfig, accessor);
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
            update: (key: string, value: any, targetScope?: ConfigurationTarget | boolean, withLanguageOverride?: boolean): PromiseLike<void> => {
                const resourceStr = overrides.resource?.toString();
                const fullPath = `${overrides.overrideIdentifier ? `[${overrides.overrideIdentifier}].` : ''}${rawSection}.${key}`;
                if (typeof value !== 'undefined') {
                    return this.proxy.$updateConfigurationOption(targetScope, fullPath, value, resourceStr, withLanguageOverride);
                } else {
                    return this.proxy.$removeConfigurationOption(targetScope, fullPath, resourceStr, withLanguageOverride);
                }
            },
            inspect: <T>(key: string): ConfigurationInspect<T> | undefined => {
                const path = `${rawSection}.${key}`;
                const result = this._preferences.inspect<T>(path, overrides, new TheiaWorkspace(this.workspace));

                if (!result) {
                    return undefined;
                }

                const configInspect: ConfigurationInspect<T> = { key };
                configInspect.defaultValue = result.default?.value;
                configInspect.globalValue = result.user?.value;
                configInspect.workspaceValue = result.workspace?.value;
                configInspect.workspaceFolderValue = result.workspaceFolder?.value;
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
                get: (targ: any, prop: string) => {
                    const config = Object.getOwnPropertyDescriptor(targ, prop);
                    // This check ensures that https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/get#invariants are satisfied
                    if (config?.configurable === false && config?.writable === false) {
                        return targ[prop];
                    }
                    return readonlyProxy(targ[prop]);
                },
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
        const folderConfigurations = new ResourceMap<ConfigurationModel>();
        Object.keys(data[PreferenceScope.Folder]).forEach(resource => {
            folderConfigurations.set(URI.parse(resource), this.getConfigurationModel(data[PreferenceScope.Folder][resource]));
        });
        return new Configuration(
            defaultConfiguration,
            new ConfigurationModel(), /** policy configuration. */
            new ConfigurationModel(), /** application configuration. */
            userConfiguration,
            new ConfigurationModel(), /** remote configuration. */
            workspaceConfiguration,
            folderConfigurations
        );
    }

    private getConfigurationModel(data: { [key: string]: any }): ConfigurationModel {
        if (!data) {
            return new ConfigurationModel();
        }
        const configData = this.parseConfigurationData(data);
        return new ConfigurationModel(configData.contents, configData.keys, configData.overrides);
    }

    private readonly OVERRIDE_PROPERTY = '^\\[(.*)\\]$';
    private readonly OVERRIDE_PROPERTY_PATTERN = new RegExp(this.OVERRIDE_PROPERTY);
    private readonly OVERRIDE_KEY_TEST = /^\[([^\]]+)\]\./;

    private parseConfigurationData(data: { [key: string]: any }): Omit<IOverrides, 'identifiers'> & { overrides: IOverrides[] } {
        const keys = new Array<string>();
        const overrides: Record<string, IOverrides> = Object.create(null);
        const contents = Object.keys(data).reduce((result: any, key: string) => {
            if (injectionRe.test(key)) {
                return result;
            }
            const parts = key.split('.');
            let branch = result;
            const isOverride = this.OVERRIDE_KEY_TEST.test(key);
            if (!isOverride) {
                keys.push(key);
            }
            for (let i = 0; i < parts.length; i++) {
                if (i === 0 && isOverride) {
                    const identifier = this.OVERRIDE_PROPERTY_PATTERN.exec(parts[i])![1];
                    if (!overrides[identifier]) {
                        overrides[identifier] = { keys: [], identifiers: [identifier], contents: Object.create(null) };
                    }
                    branch = overrides[identifier].contents;
                    overrides[identifier].keys.push(key.slice(parts[i].length + 1));
                } else if (i === parts.length - 1) {
                    branch[parts[i]] = data[key];
                } else {
                    if (!branch[parts[i]]) {
                        branch[parts[i]] = Object.create(null);
                    }
                    branch = branch[parts[i]];
                }
            }
            return result;
        }, Object.create(null));
        return { contents, keys, overrides: Object.values(overrides) };
    }

    private toConfigurationChangeEvent(eventData: PreferenceChangeExt[]): theia.ConfigurationChangeEvent {
        return Object.freeze({
            affectsConfiguration: (section: string, scope?: theia.ConfigurationScope): boolean => {
                const { resource, overrideIdentifier } = this.parseConfigurationAccessOptions(scope);
                const sectionWithLanguage = overrideIdentifier ? `[${overrideIdentifier}].${section}` : section;
                return eventData.some(change => {
                    const matchesUri = !resource || !change.scope || (resource.toString() + '/').startsWith(change.scope.endsWith('/') ? change.scope : change.scope + '/');
                    const sliceIndex = overrideIdentifier ? 0 : (this.OVERRIDE_KEY_TEST.exec(change.preferenceName)?.[0].length ?? 0);
                    const changedPreferenceName = sliceIndex ? change.preferenceName.slice(sliceIndex) : change.preferenceName;
                    return matchesUri && (
                        sectionWithLanguage === changedPreferenceName
                        || sectionWithLanguage.startsWith(`${changedPreferenceName}.`)
                        || changedPreferenceName.startsWith(`${sectionWithLanguage}.`));
                });
            }
        });
    }

    protected parseConfigurationAccessOptions(scope?: theia.ConfigurationScope | null): IConfigurationOverrides {
        if (!scope) {
            return {};
        }
        let overrideIdentifier: string | undefined = undefined;
        let resource: theia.Uri | undefined;
        if ('uri' in scope || 'languageId' in scope) {
            resource = scope.uri;
        } else {
            resource = scope;
        }
        if ('languageId' in scope) {
            overrideIdentifier = scope.languageId;
        }
        return { resource, overrideIdentifier };
    }

}
