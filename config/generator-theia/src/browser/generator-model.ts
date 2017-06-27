/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';

export interface Modules {
    [name: string]: string
}

export interface ModulesOwner {
    frontendModules?: Modules;
    backendModules?: Modules;
}

export interface ExtensionPackage extends ModulesOwner {
    name: string;
}

export interface Extensions {
    [name: string]: string
}

export interface Config {
    name: string;
    extensions: Extensions;
    localExtensions: Extensions;
}

export class Model {
    config: Config = {
        name: '',
        extensions: {},
        localExtensions: {}
    }

    protected _frontendModules: Map<string, string> | undefined;
    protected _backendModules: Map<string, string> | undefined;
    protected readonly extensionPackages = new Map<string, ExtensionPackage>();

    get allExtensions(): string[] {
        return [...Object.keys(this.config.localExtensions), ...Object.keys(this.config.extensions)];
    }

    readExtensionPackages(read: (extension: string, version: string) => ExtensionPackage | undefined): void {
        // tslint:disable-next-line:forin
        for (const extension in this.config.extensions) {
            const version = this.config.extensions[extension];
            this.readExtensionPackage(extension, () => read(extension, version));
        }
    }

    readLocalExtensionPackages(read: (extension: string, path: string) => ExtensionPackage | undefined): void {
        // tslint:disable-next-line:forin
        for (const extension in this.config.localExtensions) {
            const path = this.config.localExtensions[extension];
            this.readExtensionPackage(extension, () => read(extension, path));
        }
    }

    protected readExtensionPackage(extension: string, read: () => ExtensionPackage | undefined): void {
        if (!this.extensionPackages.has(extension)) {
            const extensionPackage: ExtensionPackage | undefined = read();
            if (extensionPackage) {
                this.extensionPackages.set(extension, extensionPackage);
            }
        }
    }

    get backendModules(): Map<string, string> {
        if (!this._backendModules) {
            this._backendModules = this.computeModules('backendModules');
        }
        return this._backendModules;
    }

    get frontendModules(): Map<string, string> {
        if (!this._frontendModules) {
            this._frontendModules = this.computeModules('frontendModules');
        }
        return this._frontendModules;
    }

    protected computeModules<K extends keyof ModulesOwner>(moduleKind: K): Map<string, string> {
        const result = new Map<string, string>();
        for (const extension of this.extensionPackages.values()) {
            const modules = extension[moduleKind];
            if (modules) {
                // tslint:disable-next-line:forin
                for (const moduleName in modules) {
                    if (!result.has(moduleName)) {
                        const modulePath = modules[moduleName];
                        const extensionPath = path.join(extension.name, modulePath);
                        result.set(moduleName, extensionPath);
                    }
                }
            }
        }
        return result;
    }

}
