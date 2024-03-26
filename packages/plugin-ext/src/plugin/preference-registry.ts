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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { isOSX, isWindows } from '@theia/core/lib/common/os';
import { URI } from '@theia/core/shared/vscode-uri';
import { ResourceMap } from '@theia/monaco-editor-core/esm/vs/base/common/map';
import { IConfigurationOverrides } from '@theia/monaco-editor-core/esm/vs/platform/configuration/common/configuration';
import { Configuration, ConfigurationModel, ConfigurationModelParser } from '@theia/monaco-editor-core/esm/vs/platform/configuration/common/configurationModels';
import { Workspace, WorkspaceFolder } from '@theia/monaco-editor-core/esm/vs/platform/workspace/common/workspace';
import * as theia from '@theia/plugin';
import { generateUuid } from '@theia/core/lib/common/uuid';
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
        super(generateUuid(), folders, false, ext.workspaceFile ?? null, () => isOSX || isWindows);
    }
}

@injectable()
export class PreferenceRegistryExtImpl implements PreferenceRegistryExt {
    @inject(RPCProtocol)
    protected rpc: RPCProtocol;

    @inject(WorkspaceExtImpl)
    protected readonly workspace: WorkspaceExtImpl;

    private proxy: PreferenceRegistryMain;
    private _preferences: Configuration;
    private readonly _onDidChangeConfiguration = new Emitter<theia.ConfigurationChangeEvent>();

    readonly onDidChangeConfiguration: Event<theia.ConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

    @postConstruct()
    initialize(): void {
        this.proxy = this.rpc.getProxy(PLUGIN_RPC_CONTEXT.PREFERENCE_REGISTRY_MAIN);
    }

    init(data: PreferenceData): void {
        this.preferencesChanged(data);
    }

    $acceptConfigurationChanged(data: PreferenceData, eventData: PreferenceChangeExt[]): void {
        this.preferencesChanged(data, eventData);
    }

    private preferencesChanged(data: PreferenceData, eventData?: PreferenceChangeExt[]): void {
        this._preferences = this.parse(data);
        this._onDidChangeConfiguration.fire(this.toConfigurationChangeEvent(eventData ?? []));
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
                const overrideSegment = overrides.overrideIdentifier ? `[${overrides.overrideIdentifier}].` : '';
                const preferenceKey = rawSection ? `${rawSection}.${key}` : key;
                const fullPath = overrideSegment + preferenceKey;
                if (typeof value !== 'undefined') {
                    return this.proxy.$updateConfigurationOption(targetScope, fullPath, value, resourceStr, withLanguageOverride);
                } else {
                    return this.proxy.$removeConfigurationOption(targetScope, fullPath, resourceStr, withLanguageOverride);
                }
            },
            inspect: <T>(key: string): ConfigurationInspect<T> | undefined => {
                const path = rawSection ? `${rawSection}.${key}` : key;
                const result = this._preferences.inspect<T>(path, overrides, new TheiaWorkspace(this.workspace));

                if (!result) {
                    return undefined;
                }

                const configInspect: ConfigurationInspect<T> = { key };
                configInspect.defaultValue = cloneDeep(result.default?.value);
                configInspect.globalValue = cloneDeep(result.user?.value);
                configInspect.workspaceValue = cloneDeep(result.workspace?.value);
                configInspect.workspaceFolderValue = cloneDeep(result.workspaceFolder?.value);
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
        const defaultConfiguration = this.getConfigurationModel('Default', data[PreferenceScope.Default]);
        const userConfiguration = this.getConfigurationModel('User', data[PreferenceScope.User]);
        const workspaceConfiguration = this.getConfigurationModel('Workspace', data[PreferenceScope.Workspace]);
        const folderConfigurations = new ResourceMap<ConfigurationModel>();
        Object.keys(data[PreferenceScope.Folder]).forEach(resource => {
            folderConfigurations.set(URI.parse(resource), this.getConfigurationModel(`Folder: ${resource}`, data[PreferenceScope.Folder][resource]));
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

    private getConfigurationModel(label: string, data: { [key: string]: any }): ConfigurationModel {
        const parser = new ConfigurationModelParser(label);
        const sanitized = this.sanitize(data);
        parser.parseRaw(sanitized);
        return parser.configurationModel;
    }

    /**
     * Creates a new object and assigns those keys of raw to it that are not likely to cause prototype pollution.
     * Also preprocesses override identifiers so that they take the form [identifier]: {...contents}.
     */
    private sanitize<T = unknown>(raw: T): T {
        if (!isObject(raw)) { return raw; }
        const asObject = raw as Record<string, unknown>;
        const sanitized = Object.create(null);
        for (const key of Object.keys(asObject)) {
            if (!injectionRe.test(key)) {
                const override = this.OVERRIDE_KEY_TEST.exec(key);
                if (override) {
                    const overrideKey = `[${override[1]}]`;
                    const remainder = key.slice(override[0].length);
                    if (!isObject(sanitized[overrideKey])) {
                        sanitized[overrideKey] = Object.create(null);
                    }
                    sanitized[overrideKey][remainder] = this.sanitize(asObject[key]);
                } else {
                    sanitized[key] = this.sanitize(asObject[key]);
                }
            }
        }
        return sanitized;
    }

    private readonly OVERRIDE_KEY_TEST = /^\[([^\]]+)\]\./;

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
