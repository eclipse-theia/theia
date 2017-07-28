/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import { NodePackage, Dependencies } from './npm';
export { NodePackage, Dependencies };

export interface ExtensionPackage extends NodePackage {
    name: string;
    theiaExtensions: Extension[];
}
export namespace ExtensionPackage {
    export function is(pck: NodePackage | undefined): pck is ExtensionPackage {
        return !!pck && !!pck.name && !!pck.theiaExtensions;
    }
}

export interface Extension {
    frontend?: string;
    frontendElectron?: string;
    backend?: string;
    backendElectron?: string;
}

export interface Config {
    copyright: string;
    node_modulesPath: string;
    localDependencies?: Dependencies;
}

export interface ExtensionConfig {
    testSupport: boolean;
    extensionKeyword: string;
}

export function sortByKey(object: { [key: string]: any }): { [key: string]: any } {
    return Object.keys(object).sort().reduce((sorted: { [key: string]: any }, key) => {
        sorted[key] = object[key];
        return sorted;
    }, {});
}

export const defaultExtensionKeyword = "theia-extension";

export class Model {
    target: 'web' | 'electron-renderer' | undefined;
    pck: NodePackage = {};
    targetPck: NodePackage = {};
    config: Config = {
        copyright: '',
        node_modulesPath: "../../node_modules"
    };
    readonly defaultExtensionConfig = <ExtensionConfig>{
        testSupport: true
    };
    extensionConfig: ExtensionConfig = {
        ...this.defaultExtensionConfig,
        extensionKeyword: defaultExtensionKeyword
    };

    protected _frontendModules: Map<string, string> | undefined;
    protected _frontendElectronModules: Map<string, string> | undefined;
    protected _backendModules: Map<string, string> | undefined;
    protected _backendElectronModules: Map<string, string> | undefined;
    protected readonly _extensionPackages = new Map<string, ExtensionPackage>();

    get extensionPackages(): ReadonlyArray<ExtensionPackage> {
        return Array.from(this._extensionPackages.values());
    }

    async readExtensionPackages(reader: {
        read: (extension: string, version: string) => Promise<NodePackage | undefined>,
        readLocal: (extension: string, path: string) => Promise<NodePackage | undefined>
    }): Promise<void> {
        if (!this.pck.dependencies) {
            return;
        }
        const localDependencies = this.config.localDependencies || {};
        // tslint:disable-next-line:forin
        for (const extension in this.pck.dependencies) {
            if (extension in localDependencies) {
                const path = localDependencies[extension];
                await this.readExtensionPackage(extension, () => reader.readLocal(extension, path));
            }
            const version = this.pck.dependencies[extension];
            await this.readExtensionPackage(extension, () => reader.read(extension, version));
        }
    }

    protected async readExtensionPackage(extension: string, read: () => Promise<NodePackage | undefined>): Promise<void> {
        if (!this._extensionPackages.has(extension)) {
            const pck = await read();
            if (ExtensionPackage.is(pck)) {
                this._extensionPackages.set(extension, pck);
            }
        }
    }

    get frontendModules(): Map<string, string> {
        if (!this._frontendModules) {
            this._frontendModules = this.computeModules('frontend');
        }
        return this._frontendModules;
    }

    get frontendElectronModules(): Map<string, string> {
        if (!this._frontendElectronModules) {
            this._frontendElectronModules = this.computeModules('frontendElectron', 'frontend');
        }
        return this._frontendElectronModules;
    }

    get backendModules(): Map<string, string> {
        if (!this._backendModules) {
            this._backendModules = this.computeModules('backend');
        }
        return this._backendModules;
    }

    get backendElectronModules(): Map<string, string> {
        if (!this._backendElectronModules) {
            this._backendElectronModules = this.computeModules('backendElectron', 'backend');
        }
        return this._backendElectronModules;
    }

    protected computeModules<P extends keyof Extension, S extends keyof Extension = P>(primary: P, secondary?: S): Map<string, string> {
        const result = new Map<string, string>();
        let moduleIndex = 1;
        for (const extensionPackage of this.extensionPackages) {
            const extensions = extensionPackage.theiaExtensions;
            if (extensions) {
                for (const extension of extensions) {
                    const modulePath = extension[primary] || (secondary && extension[secondary]);
                    if (typeof modulePath === 'string') {
                        const extensionPath = path.join(extensionPackage.name, modulePath).split(path.sep).join('/');
                        result.set(`${primary}_${moduleIndex}`, extensionPath);
                        moduleIndex = moduleIndex + 1;
                    }
                }
            }
        }
        return result;
    }

}
